from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Depends, Security
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import json
import uuid

from app.auth import get_current_user

from app.database import (
    get_resume, save_resume,
    get_settings, save_settings,
    get_jobs, get_job, save_job, delete_job,
    get_applications, move_application
)
from app.scraper import scrape_job_listing, search_linkedin_jobs
from app.tailor import analyze_match, tailor_resume, generate_cover_letter
from app.resume_parser import extract_text_from_docx, parse_resume_with_llm, parse_resume_heuristic
from app.apply import automate_apply

import traceback
from fastapi import Request

app = FastAPI(title="Job Application Tailoring Assistant")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"Global Exception: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Models
class ResumeSection(BaseModel):
    summary: str
    experience: List[Dict[str, Any]]
    education: List[Dict[str, Any]]
    skills: List[str]

class SettingsUpdate(BaseModel):
    gemini_api_key: Optional[str] = ""
    openrouter_api_key: Optional[str] = ""
    provider: Optional[str] = "gemini"
    model_name: Optional[str] = "gemini-2.5-flash"

class ScrapeRequest(BaseModel):
    url: str

class MoveRequest(BaseModel):
    job_id: str
    from_stage: str
    to_stage: str

# Resume Endpoints
@app.get("/api/resume")
async def api_get_resume(user_info: dict = Depends(get_current_user)):
    return get_resume(user_info["token"])

@app.post("/api/resume")
async def api_save_resume(resume: ResumeSection, user_info: dict = Depends(get_current_user)):
    save_resume(user_info["token"], resume.model_dump())
    return {"status": "success", "message": "Resume saved successfully"}

# Settings Endpoints
@app.get("/api/settings")
async def api_get_settings(user_info: dict = Depends(get_current_user)):
    settings = get_settings(user_info["token"])
    provider = settings.get("provider", "openrouter")
    model_name = settings.get("model_name", "google/gemini-2.5-flash")
    if model_name == "google/gemini-2.5-flash:free":
        model_name = "google/gemini-2.5-flash"
        
    if provider == "openrouter":
        has_key = bool(settings.get("openrouter_api_key") or os.environ.get("OPENROUTER_API_KEY"))
    else:
        has_key = bool(settings.get("gemini_api_key") or os.environ.get("GEMINI_API_KEY"))
        
    return {
        "has_key": has_key,
        "provider": provider,
        "model_name": model_name
    }

@app.post("/api/settings")
async def api_save_settings(payload: SettingsUpdate, user_info: dict = Depends(get_current_user)):
    save_settings(user_info["token"], payload.model_dump(exclude_unset=True))
    return {"status": "success", "message": "Settings saved successfully"}

# Scraper Endpoints
@app.post("/api/scrape")
async def api_scrape_job(payload: ScrapeRequest, user_info: dict = Depends(get_current_user)):
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
        
    try:
        job_data = scrape_job_listing(url, token=user_info["token"])
        # Save to db
        save_job(user_info["token"], job_data)
        return job_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")

@app.get("/api/search")
async def api_search_jobs(keywords: str, location: str = "", user_info: dict = Depends(get_current_user)):
    if not keywords.strip():
        raise HTTPException(status_code=400, detail="Keywords query parameter is required")
    try:
        return search_linkedin_jobs(keywords, location)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/api/jobs")
async def api_get_jobs_list(user_info: dict = Depends(get_current_user)):
    jobs = get_jobs(user_info["token"])
    return jobs

@app.get("/api/jobs/{job_id}")
async def api_get_single_job(job_id: str, user_info: dict = Depends(get_current_user)):
    job = get_job(user_info["token"], job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.delete("/api/jobs/{job_id}")
async def api_delete_job(job_id: str, user_info: dict = Depends(get_current_user)):
    delete_job(user_info["token"], job_id)
    return {"status": "success", "message": "Job deleted successfully"}

# Analysis & Tailoring Endpoints
@app.post("/api/analyze/{job_id}")
async def api_analyze_job(job_id: str, user_info: dict = Depends(get_current_user)):
    token = user_info["token"]
    job = get_job(token, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    resume = get_resume(token)
        
    # Standardize resume to text for analyzer
    resume_text = f"SUMMARY:\n{resume.get('summary', '')}\n\nEXPERIENCE:\n"
    for exp in resume.get('experience', []):
        resume_text += f"- {exp.get('title', '')} at {exp.get('company', '')} ({exp.get('dates', '')})\n"
        for bullet in exp.get('bullets', []):
            resume_text += f"  * {bullet}\n"
    resume_text += f"\nEDUCATION:\n"
    for edu in resume.get('education', []):
        resume_text += f"- {edu.get('degree', '')} from {edu.get('school', '')} ({edu.get('dates', '')})\n"
    resume_text += f"\nSKILLS:\n" + ", ".join(resume.get('skills', []))
    
    job_text = job.get("description", "")
    
    analysis = analyze_match(resume_text, job_text, None, token=token)
    
    # Save analysis back to job data
    job["analysis"] = analysis
    save_job(token, job)
    
    return analysis

@app.post("/api/tailor/{job_id}")
async def api_tailor_job_resume(job_id: str, user_info: dict = Depends(get_current_user)):
    token = user_info["token"]
    job = get_job(token, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    resume = get_resume(token)
        
    job_text = job.get("description", "")
    tailored = tailor_resume(resume, job_text, None, token=token)
    
    # Save tailored resume to job details
    job["tailored_resume"] = tailored
    save_job(token, job)
    
    return tailored

@app.post("/api/cover-letter/{job_id}")
async def api_cover_letter(job_id: str, user_info: dict = Depends(get_current_user)):
    token = user_info["token"]
    job = get_job(token, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    resume = get_resume(token)
        
    # Standardize resume to text for cover letter
    resume_text = f"SUMMARY:\n{resume.get('summary', '')}\n\nEXPERIENCE:\n"
    for exp in resume.get('experience', []):
        resume_text += f"- {exp.get('title', '')} at {exp.get('company', '')} ({exp.get('dates', '')})\n"
        for bullet in exp.get('bullets', []):
            resume_text += f"  * {bullet}\n"
    resume_text += f"\nSKILLS:\n" + ", ".join(resume.get('skills', []))
    
    job_text = job.get("description", "")
    job_title = job.get("title", "Software Engineer")
    company = job.get("company", "Company")
    
    cover_letter = generate_cover_letter(resume_text, job_text, job_title, company, None, token=token)
    
    # Save cover letter to job details
    job["cover_letter"] = cover_letter
    save_job(token, job)
    
    return {"cover_letter": cover_letter}

# Tracker Endpoints
@app.get("/api/tracker")
async def api_get_tracker_board(user_info: dict = Depends(get_current_user)):
    return get_applications(user_info["token"])

@app.post("/api/tracker/move")
async def api_move_tracker(payload: MoveRequest, user_info: dict = Depends(get_current_user)):
    move_application(user_info["token"], payload.job_id, payload.to_stage)
    return {"status": "success", "message": "Moved job successfully"}

@app.post("/api/apply/{job_id}")
async def api_apply_job(job_id: str, user_info: dict = Depends(get_current_user)):
    token = user_info["token"]
    result = automate_apply(token, job_id, api_key=None)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.get("/api/apply/download/{job_id}")
async def api_download_tailored_resume(job_id: str, user_info: dict = Depends(get_current_user)):
    token = user_info["token"]
    job = get_job(token, job_id)
    if not job or "tailored_resume_path" not in job:
        raise HTTPException(status_code=404, detail="Tailored resume not found. Please apply first.")
    
    filepath = job["tailored_resume_path"]
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Resume file does not exist on disk.")
        
    filename = os.path.basename(filepath)
    return FileResponse(filepath, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename=filename)

# Resume Upload Endpoint
@app.post("/api/resume/upload")
async def api_upload_resume(file: UploadFile = File(...), user_info: dict = Depends(get_current_user)):
    token = user_info["token"]
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx Word document files are supported.")
    
    file_bytes = await file.read()
    
    try:
        raw_text = extract_text_from_docx(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read Word document: {str(e)}")
    
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="The document appears to be empty or unreadable.")
    
    try:
        parsed = parse_resume_with_llm(raw_text, token=token)
        parsed["_source"] = "gemini"
    except Exception as e:
        print(f"Gemini parse failed, falling back to heuristic: {e}")
        parsed = parse_resume_heuristic(raw_text)
    
    # Save to database
    resume_to_save = {
        "summary": parsed.get("summary", ""),
        "experience": parsed.get("experience", []),
        "education": parsed.get("education", []),
        "skills": parsed.get("skills", [])
    }
    save_resume(token, resume_to_save)
    
    response = {**resume_to_save, "_parse_method": parsed.get("_source", "heuristic")}
    if "_parse_warning" in parsed:
        response["_parse_warning"] = parsed["_parse_warning"]
    
    return response

# Serve Frontend
# Ensure directories exist
os.makedirs("static", exist_ok=True)
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get_index():
    return FileResponse("static/index.html")
