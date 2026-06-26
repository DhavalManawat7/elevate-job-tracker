# Elevate - Job Application Tailoring Assistant

Elevate is a local, glassmorphic dark-mode web application designed to help finance professionals search, scrape, track, and tailor their resumes and cover letters for jobs in **Stock Markets, Valuations, Equity Research, Mergers & Acquisitions (M&A), Portfolio Management Services (PMS), Credit Analysis, and Hedge Funds**.

## Features

1. **Dashboard**: High-level statistics of your applications, average match score, and quick actions.
2. **My Resume Profile**: Pre-populated with high-impact finance/valuation/equity research achievements. Customize it to align with your academic credentials and internship histories.
3. **Job Listing Scraper**: Easily scrape Lever and Greenhouse job postings. For any other platforms, Elevate fetches the raw HTML and uses the Gemini API to parse the title, company, description, and qualifications.
4. **Tailoring Studio**: 
   - **Match Analysis**: Compares your resume against the scraped job description, producing a Match Score (0-100), highlighted strengths, missing keywords, and detailed resume improvement feedback.
   - **Tailored Resume**: Generates tailored professional summaries and rewritten bullet points. Highlight matching valuation methodologies (DCF, relative valuation, LBO) or market experience.
   - **Cover Letter Generator**: Drafts a personalized cover letter matching your background to the job requirements.
5. **Kanban Tracker Board**: Organize active pipelines (Wishlist, Applied, Interviewing, Offer, Rejected) with drag-and-drop support.

## Project Structure

```
job-application-assistant/
├── app/
│   ├── __init__.py
│   ├── database.py   # Local JSON database wrapper
│   ├── main.py       # FastAPI application endpoints
│   ├── scraper.py    # Job page scrapper (Lever, Greenhouse, and Generic LLM parser)
│   └── tailor.py     # Gemini LLM-based analysis & tailoring engine
├── static/
│   ├── css/
│   │   └── styles.css # Modern glassmorphic styling
│   ├── js/
│   │   └── app.js     # Single Page App routing & UI controller
│   └── index.html     # HTML Layout
├── data/
│   └── db.json        # Saved local JSON data (created on startup)
├── requirements.txt   # Python dependencies
└── README.md
```

## Quick Start

### 1. Install Dependencies
Ensure you have Python 3.10+ installed. In your terminal, run:
```bash
python -m pip install -r requirements.txt
```

### 2. Run the Local Web Server
Start the FastAPI server using Uvicorn:
```bash
python -m uvicorn app.main:app --reload
```

### 3. Open in Browser
Open your browser and navigate to:
```
http://localhost:8000
```

### 4. Configure Gemini API Key
To utilize the intelligent resume parsing, matching, and cover letter tailoring features:
1. Open Elevate and click **Configure Gemini Key** on the Dashboard (or open settings).
2. Enter your Gemini API Key (starts with `AIzaSy...`). You can get an API key for free/low-cost from the [Google AI Studio](https://aistudio.google.com/).
3. Click **Save**.
