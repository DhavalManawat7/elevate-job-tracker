from typing import Dict, Any, List, Optional
from app.auth import get_supabase

# ==========================================
# RESUME (PROFILES TABLE)
# ==========================================
def get_resume(token: Optional[str] = None) -> Dict[str, Any]:
    supabase = get_supabase(token)
    try:
        # RLS ensures user only gets their own profile
        res = supabase.table("profiles").select("*").execute()
        if res.data and len(res.data) > 0:
            profile = res.data[0]
            return {
                "summary": profile.get("summary", ""),
                "experience": profile.get("experience", []),
                "education": profile.get("education", []),
                "skills": profile.get("skills", [])
            }
        return {"summary": "", "experience": [], "education": [], "skills": []}
    except Exception as e:
        print(f"Error getting resume: {e}")
        return {"summary": "", "experience": [], "education": [], "skills": []}

def save_resume(token: Optional[str] = None, resume_data: Optional[Dict[str, Any]] = None):
    supabase = get_supabase(token)
    # Get user id from token
    user_res = supabase.auth.get_user(token)
    user_id = user_res.user.id
    try:
        supabase.table("profiles").upsert({
            "id": user_id,
            "summary": resume_data.get("summary", ""),
            "experience": resume_data.get("experience", []),
            "education": resume_data.get("education", []),
            "skills": resume_data.get("skills", [])
        }).execute()
    except Exception as e:
        print(f"Error saving resume: {e}")
        raise e

# ==========================================
# SETTINGS
# ==========================================
def get_settings(token: Optional[str] = None) -> Dict[str, Any]:
    import os
    from dotenv import load_dotenv
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(base_dir, ".env")
    load_dotenv(dotenv_path=env_path, override=True)
    
    supabase = get_supabase(token)
    try:
        res = supabase.table("settings").select("*").execute()
        if res.data and len(res.data) > 0:
            settings = res.data[0]
            settings["provider"] = "openrouter"
            model_name = settings.get("model_name", "")
            if not model_name:
                settings["model_name"] = "google/gemini-2.5-flash"
            elif model_name.endswith(":free") and ("gemini-2.5-flash" in model_name or "deepseek-r1" in model_name):
                settings["model_name"] = model_name.replace(":free", "")
                
            if not settings.get("openrouter_api_key"):
                settings["openrouter_api_key"] = os.environ.get("OPENROUTER_API_KEY", "")
            if not settings.get("gemini_api_key"):
                settings["gemini_api_key"] = os.environ.get("GEMINI_API_KEY", "")
            return settings
        
        # Default fallback settings
        model_name = os.environ.get("DEFAULT_MODEL", "google/gemini-2.5-flash")
        if model_name.endswith(":free") and ("gemini-2.5-flash" in model_name or "deepseek-r1" in model_name):
            model_name = model_name.replace(":free", "")
            
        return {
            "provider": "openrouter",
            "model_name": model_name,
            "openrouter_api_key": os.environ.get("OPENROUTER_API_KEY", ""),
            "gemini_api_key": os.environ.get("GEMINI_API_KEY", "")
        }
    except Exception as e:
        print(f"Error getting settings: {e}")
        return {
            "provider": "openrouter",
            "model_name": "google/gemini-2.5-flash",
            "openrouter_api_key": os.environ.get("OPENROUTER_API_KEY", ""),
            "gemini_api_key": os.environ.get("GEMINI_API_KEY", "")
        }

def save_settings(token: Optional[str] = None, settings_data: Optional[Dict[str, Any]] = None):
    supabase = get_supabase(token)
    user_res = supabase.auth.get_user(token)
    user_id = user_res.user.id
    try:
        settings_data["id"] = user_id
        supabase.table("settings").upsert(settings_data).execute()
    except Exception as e:
        print(f"Error saving settings: {e}")
        raise e

# ==========================================
# JOBS
# ==========================================
def get_jobs(token: Optional[str] = None) -> List[Dict[str, Any]]:
    supabase = get_supabase(token)
    try:
        # Order by created_at descending
        res = supabase.table("jobs").select("*").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        print(f"Error getting jobs: {e}")
        return []

def get_job(token: Optional[str] = None, job_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    supabase = get_supabase(token)
    try:
        res = supabase.table("jobs").select("*").eq("id", job_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        return None
    except Exception as e:
        print(f"Error getting job: {e}")
        return None

def save_job(token: Optional[str] = None, job_data: Optional[Dict[str, Any]] = None) -> str:
    supabase = get_supabase(token)
    user_res = supabase.auth.get_user(token)
    user_id = user_res.user.id
    try:
        job_data["user_id"] = user_id
        res = supabase.table("jobs").upsert(job_data).execute()
        saved_job = res.data[0]
        job_id = saved_job["id"]
        
        # Ensure it's in the applications table (wishlist by default)
        app_res = supabase.table("applications").select("*").eq("job_id", job_id).execute()
        if not app_res.data or len(app_res.data) == 0:
            supabase.table("applications").insert({
                "user_id": user_id,
                "job_id": job_id,
                "stage": "wishlist"
            }).execute()
            
        return job_id
    except Exception as e:
        print(f"Error saving job: {e}")
        raise e

def delete_job(token: Optional[str] = None, job_id: Optional[str] = None):
    supabase = get_supabase(token)
    try:
        # Applications table cascades automatically via DB constraints (ON DELETE CASCADE)
        supabase.table("jobs").delete().eq("id", job_id).execute()
    except Exception as e:
        print(f"Error deleting job: {e}")
        raise e

# ==========================================
# TRACKER
# ==========================================
def get_applications(token: Optional[str] = None) -> Dict[str, List[Dict[str, Any]]]:
    supabase = get_supabase(token)
    try:
        # We need a join to get job details for the kanban board
        # Supabase Python client supports joining tables if foreign keys exist
        res = supabase.table("applications").select("*, jobs(*)").execute()
        
        board = {
            "wishlist": [],
            "applied": [],
            "interviewing": [],
            "offer": [],
            "rejected": []
        }
        
        if res.data:
            for app in res.data:
                stage = app.get("stage", "wishlist")
                job = app.get("jobs", {})
                if not job: continue
                
                # Format to match existing frontend expectations
                card_data = {
                    "id": job.get("id"),
                    "title": job.get("title"),
                    "company": job.get("company"),
                    "url": job.get("url"),
                }
                
                # Add match score if analysis exists
                analysis = job.get("analysis")
                if analysis and isinstance(analysis, dict):
                    card_data["match_score"] = analysis.get("match_score")
                    
                if stage in board:
                    board[stage].append(card_data)
                    
        return board
    except Exception as e:
        print(f"Error getting applications: {e}")
        return {"wishlist": [], "applied": [], "interviewing": [], "offer": [], "rejected": []}

def move_application(token: Optional[str] = None, job_id: Optional[str] = None, to_stage: Optional[str] = None):
    supabase = get_supabase(token)
    user_res = supabase.auth.get_user(token)
    user_id = user_res.user.id
    try:
        # Upsert in applications table
        supabase.table("applications").upsert({
            "user_id": user_id,
            "job_id": job_id,
            "stage": to_stage
        }).execute()
    except Exception as e:
        print(f"Error moving application: {e}")
        raise e
