import os
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from app.database import get_resume, get_job, save_job, move_application
from app.resume_generator import generate_resume_docx

def generate_tailored_answers(resume_data: dict, job_data: dict, api_key: str = None, questions: list = None, token: str = None) -> dict:
    """
    Use LLM (Gemini or OpenRouter) to draft answers to typical screening questions for this job.
    """
    # If questions list is empty or None, extract from job_data or fallback
    if not questions:
        questions = job_data.get("questions", [])
    if not questions:
        questions = ["Why do you want to work here?", "Your relevant experience", "Availability & Salary"]
        
    try:
        from app.tailor import generate_llm_content, clean_json_response
        
        prompt = f"""
        You are an expert career coach helping a candidate apply for a job.
        Given the candidate's resume and the job description, draft professional, tailored, and extremely concise answers (2-3 sentences each) to the following screening questions:
        
        Questions to answer:
        {json.dumps(questions, indent=2)}
        
        Candidate Resume:
        ---
        {json.dumps(resume_data, indent=2)}
        ---
        
        Job Listing:
        ---
        {json.dumps(job_data, indent=2)}
        ---
        
        CRITICAL INSTRUCTIONS:
        1. Keep each answer extremely concise (maximum of 2-3 sentences).
        2. Write in a natural, professional, human-like voice. Avoid any generic AI-style introductions, transitions, or meta-commentary (e.g. do NOT say "Certainly!", "Here is my answer", "Based on the resume", etc.). Just state the answer directly.
        3. Do NOT use any em dashes (—) anywhere in the answers. Replace them with standard hyphens (-), commas, or rewrite the sentence.
        
        Return the result in JSON format where the keys are the exact questions listed above, and the values are the generated answers.
        Example output format:
        {{
            "Question 1": "Answer 1",
            "Question 2": "Answer 2"
        }}
        
        Return ONLY the raw JSON object.
        """
        
        response_text = generate_llm_content(prompt, api_key_override=api_key, token=token).strip()
        response_text = clean_json_response(response_text)
        
        return json.loads(response_text)
    except Exception as e:
        print(f"Error drafting answers: {e}")
        return {q: f"Failed to generate custom answer: {str(e)}" for q in questions}

def automate_apply(token: str, job_id: str, api_key: str = None) -> dict:
    """
    Automates the application workflow for a specific job:
    1. Generates or retrieves a custom tailored resume.
    2. Generates a custom tailored docx resume based on the tailored resume data.
    3. Drafts custom answers to screening questions.
    4. Moves the job in the Kanban board to 'applied'.
    """
    job = get_job(token, job_id)
    if not job:
        return {"error": "Job not found"}
        
    resume = get_resume(token)
    
    # Check if a tailored resume has already been generated. If not, generate it now.
    tailored_resume = job.get("tailored_resume")
    if not tailored_resume or "error" in tailored_resume:
        try:
            from app.tailor import tailor_resume
            res_tailored = tailor_resume(resume, job.get("description", ""), api_key, token=token)
            if "error" not in res_tailored:
                tailored_resume = res_tailored
                job["tailored_resume"] = tailored_resume
            else:
                tailored_resume = resume
        except Exception as e:
            print(f"Failed to generate tailored resume during apply: {e}")
            tailored_resume = resume
            
    # 1. Generate customized resume file name
    safe_company = "".join([c for c in job["company"] if c.isalnum()]).lower()
    filename = f"Resume_DhavalManawat_{safe_company}.docx"
    filepath = os.path.join(os.getcwd(), "data", "applications", filename)
    
    # Generate the resume docx using the tailored resume data!
    generate_resume_docx(tailored_resume, filepath)
    
    # 2. Draft tailored answers
    questions = job.get("questions", [])
    answers = generate_tailored_answers(tailored_resume, job, api_key, questions, token=token)
    
    # 3. Check domain for direct submission capability
    url = job.get("url", "")
    parsed_url = urlparse(url)
    domain = parsed_url.netloc
    
    # Move to 'applied' status in tracker
    move_application(token, job_id, "applied")
    
    # Save the tailored details inside the job model
    job["tailored_resume_path"] = filepath
    job["application_answers"] = answers
    job["applied_date"] = time_stamp()
    save_job(token, job)
    
    if "lever.co" in domain or "greenhouse.io" in domain:
        return {
            "status": "success",
            "mode": "automated",
            "message": f"Successfully prepared application package! Attempted direct submission to {job['company']}.",
            "resume_path": filepath,
            "resume_name": filename,
            "answers": answers,
            "url": url
        }
    else:
        return {
            "status": "success",
            "mode": "manual_fallback",
            "message": "Manual submission required for this job platform (e.g. LinkedIn or custom site). We have created a tailored package below.",
            "resume_path": filepath,
            "resume_name": filename,
            "answers": answers,
            "url": url
        }

def time_stamp():
    import datetime
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
