from google import genai
import json
import os
import requests
import re
from typing import Dict, Any
from app.database import get_settings

def clean_json_response(text: str) -> str:
    # Strip <think>...</think> block if present
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if text.startswith("```json"):
        text = text.replace("```json", "", 1)
    if text.startswith("```"):
        text = text.replace("```", "", 1)
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

def generate_llm_content(prompt: str, api_key_override: str = None, token: str = None) -> str:
    """
    Generate content using the selected provider and model in settings.
    """
    settings = get_settings(token)
    provider = settings.get("provider", "gemini")
    model_name = settings.get("model_name", "gemini-2.5-flash")
    
    if provider == "openrouter":
        api_key = settings.get("openrouter_api_key", "")
        if not api_key:
            api_key = api_key_override or os.environ.get("OPENROUTER_API_KEY", "")
            
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8080",
            "X-Title": "Elevate Job Tailoring Assistant"
        }
        payload = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3
        }
        try:
            res = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=60)
            if res.status_code != 200:
                raise Exception(f"OpenRouter API error (Status {res.status_code}): {res.text}")
            return res.json()["choices"][0]["message"]["content"]
        except Exception as e:
            raise Exception(f"Failed to generate content via OpenRouter: {e}")
    else:
        # Default to Gemini SDK
        api_key = settings.get("gemini_api_key", "")
        if not api_key:
            api_key = api_key_override or os.environ.get("GEMINI_API_KEY", "")
            
        if not api_key:
            raise Exception("Gemini API key is missing. Please set it in Settings.")
            
        gemini_model = model_name
        if "/" in gemini_model:
            gemini_model = gemini_model.split("/")[-1].split(":")[0]
            if gemini_model not in ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"]:
                gemini_model = "gemini-2.5-flash"
                
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=gemini_model,
            contents=prompt,
        )
        return response.text

def analyze_match(resume_text: str, job_text: str, api_key: str = None, token: str = None) -> Dict[str, Any]:
    try:
        prompt = f"""
        You are an expert HR recruiter and career coach. Compare the following Resume with the Job Description.
        Analyze the alignment and provide your assessment in JSON format.
        
        Resume:
        ---
        {resume_text}
        ---
        
        Job Description:
        ---
        {job_text}
        ---
        
        Provide the following details in JSON format:
        1. match_score: A number between 0 and 100 representing how well the resume matches the job.
        2. matching_skills: A list of key skills present in both the job description and the resume.
        3. missing_skills: A list of important skills, tools, or keywords mentioned in the job description that are missing or weak in the resume.
        4. feedback: A list of concrete, actionable suggestions to improve the resume for this specific job.
        5. key_highlights: A list of 2-3 strong points of alignment that should be emphasized.
        
        JSON Output Format:
        {{
            "match_score": 75,
            "matching_skills": ["Python", "SQL", "Git"],
            "missing_skills": ["AWS", "Docker", "CI/CD"],
            "feedback": [
                "Detail your experience with Docker under the project section.",
                "Incorporate CI/CD keywords in your previous DevOps role."
            ],
            "key_highlights": [
                "Your 3 years of Python experience aligns perfectly with the senior developer requirements.",
                "Strong background in relational databases matching the backend stack."
            ]
        }}
        
        Return ONLY the raw JSON object, without any markdown formatting.
        """
        response_text = generate_llm_content(prompt, api_key_override=api_key, token=token).strip()
        response_text = clean_json_response(response_text)
        return json.loads(response_text)
    except Exception as e:
        import traceback
        error_msg = f"Error in analyze_match: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        try:
            with open("tailor_error.log", "w", encoding="utf-8") as f:
                f.write(error_msg)
        except Exception as log_err:
            print(f"Failed to write tailor log file: {log_err}")
            
        return {
            "match_score": 0,
            "matching_skills": [],
            "missing_skills": [],
            "feedback": [f"Error occurred: {str(e)}. Please check your API key and connection."],
            "key_highlights": []
        }

def tailor_resume(resume_data: Dict[str, Any], job_text: str, api_key: str = None, token: str = None) -> Dict[str, Any]:
    try:
        resume_str = json.dumps(resume_data, indent=2)
        
        prompt = f"""
        You are an expert resume writer. Write as if you ARE the candidate describing their own work, not an AI writing about them.
        Given a candidate's base resume (in JSON format) and a target Job Description,
        tailor the resume to highlight the most relevant experiences, skills, and accomplishments.
        Make sure you do NOT invent or fabricate any false experience or credentials. Only rewrite and rephrase existing information to highlight alignment.
        
        Preserve the candidate's original writing voice and sentence structure where possible. Only rephrase when necessary to highlight alignment with the job description.
        
        Base Resume JSON:
        ---
        {resume_str}
        ---
        
        Target Job Description:
        ---
        {job_text}
        ---
        
        Please return a tailored resume in JSON format matching the exact structure of the input resume:
        - summary: A highly tailored professional summary (2-3 sentences) emphasizing alignment.
        - experience: An array of jobs. For each job, keep the company, title, dates, and location, but rewrite and filter the bullet points to showcase relevance to the job requirements.
        - education: Keep unchanged.
        - skills: A list of skills, but prioritize and sort the skills that match the job description first, and add keywords from the job description that the candidate possesses but might have omitted.
        
        CRITICAL FORMATTING & STYLE CONSTRAINTS:
        1. ONE-PAGE LIMIT: Keep the resume compact enough to fit exactly on a single page. 
           - For each job in the experience array, select and output ONLY the most relevant bullet points.
           - Limit the number of bullet points to a maximum of 3 bullets for the co-founder / CFO role, and 2 bullets for any other article assistant / internship role. Omit points that do not relate to the target job.
        2. NO EM DASHES: Do NOT use any em dashes (—) anywhere in the resume text. Use standard hyphens (-), commas, or adjust sentence structure.
        3. BANNED PHRASES: NEVER use these phrases: 'results-driven', 'dynamic professional', 'passionate about', 'seeking to leverage', 'proven track record', 'spearheaded', 'synergy', 'leveraged paradigms', 'seamlessly integrated', 'testament to', 'transformative', 'paved the way', 'cutting-edge', 'best-in-class', 'game-changer', 'robust', 'holistic', 'end-to-end', 'cross-functional'. These get flagged by ATS AI-detection filters.
        4. NO AI-LIKE OR BUZZWORD-HEAVY LANGUAGE: Ensure the writing style is natural, professional, direct, and reads like it was written by a human.
           - Use simple, direct financial and operational terminology (e.g. "built", "conducted", "audited", "analyzed", "prepared", "managed").
        5. ACTION VERBS AND METRICS: Each bullet must start with a past-tense action verb. Quantify outcomes with specific numbers, percentages, or dollar amounts where the original data supports it. Do NOT invent metrics.
        
        Format the JSON exactly like this:
        {{
            "summary": "...",
            "experience": [
                {{
                    "company": "...",
                    "title": "...",
                    "dates": "...",
                    "location": "...",
                    "bullets": ["bullet 1", "bullet 2"]
                }}
            ],
            "education": [
                {{
                    "school": "...",
                    "degree": "...",
                    "dates": "..."
                }}
            ],
            "skills": ["Skill 1", "Skill 2"]
        }}
        
        Return ONLY the raw JSON object, without any markdown formatting.
        """
        response_text = generate_llm_content(prompt, api_key_override=api_key, token=token).strip()
        response_text = clean_json_response(response_text)
        return json.loads(response_text)
    except Exception as e:
        import traceback
        error_msg = f"Error in tailor_resume: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        try:
            with open("tailor_error.log", "w", encoding="utf-8") as f:
                f.write(error_msg)
        except Exception as log_err:
            print(f"Failed to write tailor log file: {log_err}")
            
        return {
            "error": f"Failed to tailor resume: {str(e)}",
            "summary": "Tailoring failed. Please check backend logs.",
            "experience": resume_data.get("experience", []),
            "education": resume_data.get("education", []),
            "skills": resume_data.get("skills", [])
        }

def generate_cover_letter(resume_text: str, job_text: str, job_title: str, company: str, api_key: str = None, token: str = None) -> str:
    try:
        prompt = f"""
        You are an expert executive recruiter and copywriter.
        Write a professional, compelling, and tailored Cover Letter for a candidate applying to the position of '{job_title}' at '{company}'.
        
        Use the candidate's Resume to anchor their actual achievements and skills, and align them with the key needs in the Job Description.
        Do NOT make up any details that are not in the resume. Keep the tone enthusiastic, confident, and professional.
        
        Candidate's Resume:
        ---
        {resume_text}
        ---
        
        Job Description:
        ---
        {job_text}
        ---
        
        The cover letter should contain standard sections:
        - Date and contact information placeholders.
        - Salutation (Dear Hiring Manager or similar).
        - Hook/Opening paragraph stating the position applied for and expression of enthusiasm.
        - Body paragraphs (1-2) linking candidate's specific relevant achievements/skills to the job requirements.
        - Closing paragraph summarizing suitability, next steps (call to action), and professional sign-off.
        
        Return ONLY the cover letter text, without markdown code fences or headers.
        """
        response_text = generate_llm_content(prompt, api_key_override=api_key, token=token)
        # Strip thinking tags from cover letter if present
        response_text = re.sub(r"<think>.*?</think>", "", response_text, flags=re.DOTALL).strip()
        return response_text.strip()
    except Exception as e:
        print(f"Error in generate_cover_letter: {e}")
        return f"Error generating cover letter: {str(e)}. Please check your connection and API key."
