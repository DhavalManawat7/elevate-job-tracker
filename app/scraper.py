import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, quote_plus
import json
import uuid

def search_linkedin_jobs(keywords: str, location: str = "") -> list:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "*/*"
    }
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={quote_plus(keywords)}&location={quote_plus(location)}&start=0"
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            return []
            
        soup = BeautifulSoup(response.text, "html.parser")
        jobs = []
        for li in soup.select("li"):
            title_el = li.select_one(".base-search-card__title")
            company_el = li.select_one(".base-search-card__subtitle")
            location_el = li.select_one(".job-search-card__location")
            link_el = li.select_one("a.base-card__full-link")
            
            if title_el and link_el:
                title = title_el.get_text(strip=True)
                company = company_el.get_text(strip=True) if company_el else "Unknown Company"
                loc = location_el.get_text(strip=True) if location_el else "Unknown Location"
                link = link_el.get("href").split("?")[0]
                
                # Extract job ID
                job_id_match = re.search(r'-(\d+)$', link) or re.search(r'/view/(\d+)', link)
                job_id = job_id_match.group(1) if job_id_match else str(uuid.uuid4())[:8]
                
                jobs.append({
                    "id": job_id,
                    "title": title,
                    "company": company.strip(),
                    "location": loc.strip(),
                    "url": link
                })
        return jobs
    except Exception as e:
        print(f"Error searching LinkedIn jobs: {e}")
        return []

def scrape_job_listing(url: str, api_key: str = None, token: str = None) -> dict:
    parsed_url = urlparse(url)
    domain = parsed_url.netloc
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        html = response.text
    except Exception as e:
        raise Exception(f"Failed to fetch the URL: {str(e)}")
        
    soup = BeautifulSoup(html, "html.parser")
    
    # Check if it's Lever
    if "lever.co" in domain:
        return _parse_lever(soup, url)
    # Check if it's Greenhouse
    elif "greenhouse.io" in domain:
        return _parse_greenhouse(soup, url)
    # Check if it's LinkedIn
    elif "linkedin.com" in domain:
        return _parse_linkedin(soup, url)
    # Generic parser (optionally LLM-assisted)
    else:
        return _parse_generic(soup, url, html, api_key, token)

def _parse_lever(soup: BeautifulSoup, url: str) -> dict:
    title_el = soup.select_one(".posting-header h2")
    title = title_el.get_text(strip=True) if title_el else "Unknown Job Title"
    
    path_parts = urlparse(url).path.strip("/").split("/")
    company = path_parts[0].replace("-", " ").title() if len(path_parts) > 0 else "Unknown Company"
    
    desc_el = soup.select_one(".section.page-centered")
    description = ""
    if desc_el:
        description = desc_el.get_text(separator="\n", strip=True)
    else:
        sections = soup.select(".section")
        description = "\n\n".join([s.get_text(separator="\n", strip=True) for s in sections])
        
    # Scrape custom questions from Lever /apply page
    questions = []
    try:
        apply_url = url.rstrip('/') + '/apply'
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
        res = requests.get(apply_url, headers=headers, timeout=10)
        if res.status_code == 200:
            apply_soup = BeautifulSoup(res.text, "html.parser")
            for q_el in apply_soup.select(".application-question"):
                label = q_el.select_one(".application-label")
                if label:
                    q_text = label.get_text(strip=True).replace("*", "").strip()
                    if q_text and q_text not in questions:
                        ignore_keywords = ["resume", "cv", "first name", "last name", "email", "phone", "full name", "photo"]
                        if not any(k in q_text.lower() for k in ignore_keywords):
                            questions.append(q_text)
    except Exception as e:
        print(f"Failed to scrape Lever questions: {e}")
        
    return {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "company": company,
        "description": description,
        "url": url,
        "source": "lever",
        "questions": questions
    }

def _parse_greenhouse(soup: BeautifulSoup, url: str) -> dict:
    title_el = soup.select_one("h1.app-title")
    title = title_el.get_text(strip=True) if title_el else "Unknown Job Title"
    
    company_el = soup.select_one(".company-name")
    if company_el:
        company = company_el.get_text(strip=True)
        if company.lower().startswith("at "):
            company = company[3:]
    else:
        path_parts = urlparse(url).path.strip("/").split("/")
        company = path_parts[0].replace("-", " ").title() if len(path_parts) > 0 else "Unknown Company"
        
    desc_el = soup.select_one("#content")
    description = desc_el.get_text(separator="\n", strip=True) if desc_el else ""
    
    if not description:
        body_el = soup.select_one(".job-body") or soup.select_one(".job-description")
        if body_el:
            description = body_el.get_text(separator="\n", strip=True)
            
    # Scrape custom questions from Greenhouse page
    questions = []
    try:
        form = soup.select_one("#application_form") or soup.select_one(".application-form") or soup.select_one("form")
        if form:
            for field in form.select(".field"):
                label = field.select_one("label")
                if label:
                    q_text = label.get_text(strip=True).replace("*", "").strip()
                    ignore_keywords = ["resume", "cv", "first name", "last name", "email", "phone", "full name", "cover letter"]
                    if not any(k in q_text.lower() for k in ignore_keywords):
                        if q_text and q_text not in questions:
                            questions.append(q_text)
    except Exception as e:
        print(f"Failed to scrape Greenhouse questions: {e}")
        
    return {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "company": company,
        "description": description,
        "url": url,
        "source": "greenhouse",
        "questions": questions
    }

def _parse_linkedin(soup: BeautifulSoup, url: str) -> dict:
    title_el = soup.select_one(".top-card-layout__title") or soup.find("h1")
    company_el = soup.select_one(".topcard__org-name-link") or soup.select_one(".topcard__flavor a") or soup.select_one(".top-card-layout__first-subline a")
    desc_el = soup.select_one(".description__text") or soup.select_one(".show-more-less-html__markup")
    location_el = soup.select_one(".topcard__flavor--bullet") or soup.select_one(".top-card-layout__first-subline")
    
    title = title_el.get_text(strip=True) if title_el else "Unknown Job Title"
    company = company_el.get_text(strip=True) if company_el else "Unknown Company"
    location = location_el.get_text(strip=True) if location_el else None
    
    company = re.sub(r'\s+', ' ', company).strip()
    if location:
        location = re.sub(r'\s+', ' ', location).strip()
        if company.lower() in location.lower():
            location = location.replace(company, "").strip()
            location = location.lstrip("·•, ").strip()
            
    description = ""
    if desc_el:
        description = desc_el.get_text(separator="\n", strip=True)
        
    return {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "company": company,
        "description": description,
        "location": location,
        "url": url,
        "source": "linkedin",
        "questions": []
    }

def _parse_generic(soup: BeautifulSoup, url: str, raw_html: str, api_key: str = None, token: str = None) -> dict:
    # If we have an API Key or token, we try to use it to parse the page cleanly.
    # First, let's extract the visible text to reduce prompt size and avoid HTML clutter.
    for script in soup(["script", "style", "nav", "footer", "header"]):
        script.extract()
        
    raw_text = soup.get_text(separator="\n", strip=True)
    # Clean up excessive newlines
    raw_text = re.sub(r'\n+', '\n', raw_text)
    
    # Limit raw text length for prompt
    truncated_text = raw_text[:8000]
    
    try:
        from app.tailor import generate_llm_content, clean_json_response
        
        prompt = f"""
        You are an expert job application assistant. Below is the raw text extracted from a job posting website: {url}.
        Please analyze the text and extract the following details in JSON format:
        1. company: The name of the company hiring.
        2. title: The job title.
        3. description: A clean, structured version of the job description, listing responsibilities and requirements clearly.
        4. location: The job location (e.g., Remote, hybrid, or specific city). If not found, output null.
        5. questions: A list of any custom screening questions or application questions mentioned on the page (e.g., 'Why are you interested in this role?', 'What is your notice period?'). If none are found, output an empty list [].
        
        JSON Output Format:
        {{
            "company": "Company Name",
            "title": "Job Title",
            "description": "Full structured job description text...",
            "location": "Location",
            "questions": ["Question 1", "Question 2"]
        }}
        
        Make sure to return ONLY the raw JSON object, without markdown blocks.
        
        Raw Text:
        ---
        {truncated_text}
        ---
        """
        
        response_text = generate_llm_content(prompt, api_key_override=api_key, token=token).strip()
        response_text = clean_json_response(response_text)
        
        parsed_json = json.loads(response_text)
        
        return {
            "id": str(uuid.uuid4())[:8],
            "title": parsed_json.get("title", "Unknown Job Title"),
            "company": parsed_json.get("company", "Unknown Company"),
            "description": parsed_json.get("description", raw_text[:4000]),
            "location": parsed_json.get("location"),
            "url": url,
            "source": "generic-llm",
            "questions": parsed_json.get("questions", [])
        }
    except Exception as e:
        print(f"LLM generic job parsing failed: {e}")
        # Fallback to simple heuristic if LLM fail
            
    # Simple Heuristic Parser
    # Title from <title> or <h1>
    title = "Unknown Job Title"
    title_el = soup.find("title")
    if title_el:
        title = title_el.get_text(strip=True)
        # Often titles are like "Job Title | Company" or "Company - Job Title"
        for sep in ["|", "-", " at "]:
            if sep in title:
                parts = title.split(sep)
                # Keep the first part or longest part as title
                title = parts[0].strip()
                break
                
    h1_el = soup.find("h1")
    if h1_el:
        title = h1_el.get_text(strip=True)
        
    company = "Unknown Company"
    parsed_domain = parsed_url.netloc.replace("www.", "")
    domain_parts = parsed_domain.split(".")
    if len(domain_parts) > 1:
        company = domain_parts[-2].title()
        
    return {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "company": company,
        "description": raw_text[:4000], 
        "url": url,
        "source": "generic-heuristic",
        "questions": []
    }
