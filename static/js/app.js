document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // SUPABASE AUTHENTICATION
    // ==========================================
    const supabaseUrl = 'https://pkczvqtieoysxpslvhga.supabase.co';
    const supabaseKey = 'sb_publishable_ZyRRzU4ar266-RLKN0KCnQ_amj7T5R1';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

    const authOverlay = document.getElementById("auth-overlay");
    const authForm = document.getElementById("auth-form");
    const authEmail = document.getElementById("auth-email");
    const authPassword = document.getElementById("auth-password");
    const btnAuthSubmit = document.getElementById("btn-auth-submit");
    const authError = document.getElementById("auth-error");
    const btnSignOut = document.getElementById("sidebar-signout-btn");
    
    // Auth Toggle Elements
    const authToggleMode = document.getElementById("auth-toggle-mode");
    const authTitle = document.getElementById("auth-title");
    const authSubtitle = document.getElementById("auth-subtitle");
    const authSwitchText = document.getElementById("auth-switch-text");
    
    let authMode = 'signin'; // 'signin' or 'signup'

    function toggleAuthMode(e) {
        e.preventDefault();
        authError.style.display = "none";
        authEmail.value = "";
        authPassword.value = "";
        
        if (authMode === 'signin') {
            authMode = 'signup';
            authTitle.textContent = "Create an account";
            authSubtitle.textContent = "Sign up to start organizing your job applications.";
            btnAuthSubmit.textContent = "Sign Up";
            authSwitchText.innerHTML = `Already have an account? <a href="#" id="auth-toggle-mode">Sign in</a>`;
        } else {
            authMode = 'signin';
            authTitle.textContent = "Welcome back";
            authSubtitle.textContent = "Enter your details to access your workspace.";
            btnAuthSubmit.textContent = "Sign In";
            authSwitchText.innerHTML = `Don't have an account? <a href="#" id="auth-toggle-mode">Sign up</a>`;
        }
        
        // Re-attach listener since we replaced innerHTML
        document.getElementById("auth-toggle-mode").addEventListener("click", toggleAuthMode);
    }
    authToggleMode.addEventListener("click", toggleAuthMode);

    async function checkAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            authOverlay.classList.add("visible");
        } else {
            authOverlay.classList.remove("visible");
            loadDashboardStats();
            checkSettingsStatus();
        }
    }

    checkAuth();

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            authOverlay.classList.add("visible");
        } else if (event === 'SIGNED_IN' || session) {
            authOverlay.classList.remove("visible");
            loadDashboardStats();
            checkSettingsStatus();
        }
    });

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = authEmail.value.trim();
        const password = authPassword.value;
        
        authError.style.display = "none";
        
        if (authMode === 'signin') {
            btnAuthSubmit.textContent = "Signing In...";
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            btnAuthSubmit.textContent = "Sign In";
            
            if (error) {
                authError.style.display = "block";
                authError.textContent = error.message;
            } else {
                showToast("Signed in successfully.", "success");
            }
        } else {
            btnAuthSubmit.textContent = "Creating...";
            const { data, error } = await supabase.auth.signUp({ email, password });
            btnAuthSubmit.textContent = "Sign Up";
            
            if (error) {
                authError.style.display = "block";
                authError.textContent = error.message;
            } else {
                showToast("Account created! You are now signed in.", "success");
                // Reset back to signin mode silently for future
                authMode = 'signin';
            }
        }
    });

    if (btnSignOut) {
        btnSignOut.addEventListener("click", async () => {
            await supabase.auth.signOut();
            showToast("Signed out", "info");
        });
    }

    // Custom fetch wrapper to inject JWT token
    async function apiFetch(url, options = {}) {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        
        const headers = options.headers || {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        options.headers = headers;
        return fetch(url, options);
    }

    // Page state
    let activePage = "dashboard";
    let jobsList = [];
    let activeJobId = null;
    let hasApiKey = true;
    let baseResume = null;

    // Elements
    const navItems = document.querySelectorAll(".nav-item");
    const pages = document.querySelectorAll(".page-section");
    const statusDot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");

    // Scrape Overlay Dialog Elements
    const scrapeDialog = document.getElementById("scrape-dialog-overlay");
    const openScrapeDialogBtn = document.getElementById("dash-quick-scrape-btn");
    const closeScrapeDialogBtn = document.getElementById("btn-close-scrape-dialog");
    const triggerDialogScrapeBtn = document.getElementById("btn-dialog-trigger-scrape");
    const dialogScrapeUrl = document.getElementById("dialog-scrape-url");

    // Settings Overlay Dialog Elements removed

    // Initialize Page Router
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const pageId = item.getAttribute("data-page");
            switchPage(pageId);
        });
    });

    function switchPage(pageId) {
        activePage = pageId;
        navItems.forEach(el => el.classList.remove("active"));
        pages.forEach(el => el.classList.remove("active"));

        const selectedNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
        if (selectedNav) selectedNav.classList.add("active");
        
        const selectedPage = document.getElementById(`page-${pageId}`);
        if (selectedPage) selectedPage.classList.add("active");

        if (pageId === "dashboard") {
            loadDashboardStats();
        } else if (pageId === "resume") {
            loadResume();
        } else if (pageId === "jobs") {
            loadJobs();
        } else if (pageId === "tailor") {
            loadTailorDropdown();
        } else if (pageId === "tracker") {
            loadKanbanBoard();
        }
    }

    // ==========================================
    // TOAST NOTIFICATION SYSTEM
    // ==========================================
    function showToast(message, type = "info") {
        const existing = document.getElementById("app-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "app-toast";
        toast.className = `toast ${type}`;
        toast.innerText = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.3s";
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ==========================================
    // DARK MODE TOGGLE
    // ==========================================
    const themeBtn = document.getElementById("sidebar-theme-btn");
    const themeIcon = document.getElementById("theme-icon");

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("elevate-theme", theme);
        // Update icon: moon for light mode (click to go dark), sun for dark mode
        if (theme === "dark") {
            themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        } else {
            themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
        }
    }

    // Load saved theme
    const savedTheme = localStorage.getItem("elevate-theme") || "dark";
    applyTheme(savedTheme);

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            applyTheme(current === "dark" ? "light" : "dark");
        });
    }

    // ==========================================
    // MODAL HELPERS
    // ==========================================
    function openModal(modal) {
        modal.classList.add("visible");
    }
    function closeModal(modal) {
        modal.classList.remove("visible");
    }

    [scrapeDialog].forEach(modal => {
        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) closeModal(modal);
            });
        }
    });

    openScrapeDialogBtn.addEventListener("click", () => openModal(scrapeDialog));
    closeScrapeDialogBtn.addEventListener("click", () => closeModal(scrapeDialog));

    // Settings gear in sidebar removed

    // Dashboard shortcuts
    document.getElementById("dash-edit-resume-btn").addEventListener("click", () => switchPage("resume"));

    // Check backend API Key status
    async function checkSettingsStatus(retryCount = 0) {
        try {
            const res = await apiFetch("/api/settings");
            if (res.ok) {
                const settings = await res.json();
                hasApiKey = settings.has_key;
                const providerName = settings.provider === "openrouter" ? "OpenRouter" : "Gemini";
                if (hasApiKey) {
                    statusDot.className = "status-dot";
                    statusDot.style.background = "var(--green)";
                    statusText.innerText = `${providerName} Connected`;
                    
                    const zone = document.getElementById("resume-upload-zone");
                    const uploadStatusText = document.getElementById("upload-status-text");
                    const uploadIcon = document.getElementById("upload-icon");
                    if (zone && uploadStatusText) {
                        zone.style.borderColor = "";
                        zone.style.background = "";
                        if (uploadIcon) {
                            uploadIcon.setAttribute("stroke", "var(--accent)");
                        }
                        uploadStatusText.innerHTML = `
                            <p style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.15rem;">Upload Your Resume (.docx)</p>
                            <p style="font-size: 0.8rem; color: var(--text-secondary);">Drag & drop your Word document here, or click to browse</p>
                            <p style="font-size: 0.75rem; color: var(--accent); margin-top: 0.35rem;">AI will automatically extract all fields</p>
                        `;
                    }
                } else {
                    statusDot.className = "status-dot";
                    statusDot.style.background = "var(--red)";
                    statusText.innerText = `${providerName} Key Missing`;
                    
                    const zone = document.getElementById("resume-upload-zone");
                    const uploadStatusText = document.getElementById("upload-status-text");
                    const uploadIcon = document.getElementById("upload-icon");
                    if (zone && uploadStatusText) {
                        zone.style.borderColor = "var(--red)";
                        if (uploadIcon) {
                            uploadIcon.setAttribute("stroke", "var(--red)");
                        }
                        uploadStatusText.innerHTML = `
                            <p style="font-size: 0.95rem; font-weight: 600; color: var(--red); margin-bottom: 0.15rem;">API Key Missing</p>
                            <p style="font-size: 0.8rem; color: var(--text-secondary);">Please configure your API key in your server's .env file.</p>
                        `;
                    }
                }
            } else {
                statusDot.className = "status-dot";
                statusDot.style.background = "var(--red)";
                statusText.innerText = "Connection Error";
            }
        } catch (e) {
            console.error("Failed to check settings status:", e);
            statusDot.className = "status-dot";
            statusDot.style.background = "var(--red)";
            statusText.innerText = "Connection Error";
        }
    }

    // Settings modal logic removed

    // ==========================================
    // 1. DASHBOARD PAGE LOGIC
    // ==========================================
    async function loadDashboardStats() {
        try {
            const jobsRes = await apiFetch("/api/jobs");
            if (!jobsRes.ok) {
                console.warn("Failed to fetch dashboard stats (unauthorized or error).");
                return;
            }
            const jobs = await jobsRes.json();
            if (!Array.isArray(jobs)) {
                console.warn("Expected jobs list to be an array, got:", jobs);
                return;
            }
            jobsList = jobs;
            
            document.getElementById("stat-total-jobs").innerText = jobs.length;
            
            let scoresSum = 0;
            let scoredCount = 0;
            jobs.forEach(j => {
                if (j.analysis && typeof j.analysis.match_score === 'number') {
                    scoresSum += j.analysis.match_score;
                    scoredCount++;
                }
            });
            const avgScore = scoredCount > 0 ? Math.round(scoresSum / scoredCount) : null;
            document.getElementById("stat-avg-match").innerText = avgScore ? `${avgScore}%` : "--%";
            
            const trackerRes = await apiFetch("/api/tracker");
            const tracker = await trackerRes.json();
            
            let activeCount = tracker.wishlist.length + tracker.applied.length + tracker.interviewing.length;
            document.getElementById("stat-active-apps").innerText = activeCount;
            document.getElementById("stat-interviews").innerText = tracker.interviewing.length;
            
            const recentContainer = document.getElementById("dash-recent-jobs");
            if (jobs.length === 0) {
                recentContainer.innerHTML = `
                    <div class="empty-state">
                        <p>No imported jobs found. Paste a job URL in the Job Finder to begin!</p>
                    </div>`;
                return;
            }
            
            const sortedJobs = [...jobs].reverse().slice(0, 4);
            recentContainer.innerHTML = sortedJobs.map(job => `
                <div class="glass-card job-item" style="padding: 0.85rem;" onclick="viewJobDirectly('${job.id}')">
                    <div class="job-item-header">
                        <span class="job-item-title">${job.title}</span>
                        <span class="job-badge">${job.source || 'web'}</span>
                    </div>
                    <div class="job-item-company">${job.company}</div>
                </div>
            `).join("");
        } catch (e) {
            console.error("Dashboard statistics loading failed:", e);
        }
    }
    
    window.viewJobDirectly = (jobId) => {
        switchPage("jobs");
        setTimeout(() => {
            selectJobItem(jobId);
        }, 100);
    };

    // ==========================================
    // 2. RESUME PROFILE LOGIC
    // ==========================================
    let expCounter = 0;
    let eduCounter = 0;

    function addExperienceField(data = null) {
        const id = expCounter++;
        const container = document.getElementById("experience-list");
        
        const html = `
            <div class="resume-item-form" id="exp-form-${id}">
                <button type="button" class="btn-remove-item" onclick="removeResumeItem('exp-form-${id}')">
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div class="form-group">
                        <label class="form-label">Company Name</label>
                        <input type="text" class="form-control exp-company" value="${data ? data.company : ''}" placeholder="e.g. Goldman Sachs">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Job Title</label>
                        <input type="text" class="form-control exp-title" value="${data ? data.title : ''}" placeholder="e.g. Equity Research Associate">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div class="form-group">
                        <label class="form-label">Dates Worked</label>
                        <input type="text" class="form-control exp-dates" value="${data ? data.dates : ''}" placeholder="e.g. Jun 2024 - Present">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Location</label>
                        <input type="text" class="form-control exp-location" value="${data ? data.location : ''}" placeholder="e.g. Mumbai, India">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Achievements & Bullet Points</label>
                    <div class="bullet-points-container" id="exp-bullets-${id}">
                    </div>
                    <button type="button" class="btn btn-secondary" style="margin-top: 0.35rem; padding: 0.2rem 0.5rem; font-size: 0.7rem;" onclick="addBulletField(${id})">
                        + Add Bullet Point
                    </button>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', html);
        
        const bulletContainer = document.getElementById(`exp-bullets-${id}`);
        if (data && data.bullets && data.bullets.length > 0) {
            data.bullets.forEach(b => addBulletField(id, b));
        } else {
            addBulletField(id);
        }
    }

    window.addBulletField = (expId, value = "") => {
        const container = document.getElementById(`exp-bullets-${expId}`);
        const html = `
            <div class="bullet-row" style="margin-bottom: 0.25rem;">
                <input type="text" class="form-control exp-bullet-input" value="${value}" placeholder="Describe a key achievement or responsibility...">
                <button type="button" class="btn btn-danger" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;" onclick="this.parentElement.remove()">
                    &times;
                </button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    };

    function addEducationField(data = null) {
        const id = eduCounter++;
        const container = document.getElementById("education-list");
        
        const html = `
            <div class="resume-item-form" id="edu-form-${id}">
                <button type="button" class="btn-remove-item" onclick="removeResumeItem('edu-form-${id}')">
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div class="form-group">
                        <label class="form-label">School/University</label>
                        <input type="text" class="form-control edu-school" value="${data ? data.school : ''}" placeholder="e.g. Indian Institute of Management (IIM)">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Degree/Field of Study</label>
                        <input type="text" class="form-control edu-degree" value="${data ? data.degree : ''}" placeholder="e.g. MBA in Finance / CFA Level II">
                    </div>
                </div>
                <div class="form-group" style="width: 50%;">
                    <label class="form-label">Dates/Graduation Year</label>
                    <input type="text" class="form-control edu-dates" value="${data ? data.dates : ''}" placeholder="e.g. Class of 2024">
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', html);
    }

    window.removeResumeItem = (elemId) => {
        document.getElementById(elemId).remove();
    };

    document.getElementById("btn-add-experience").addEventListener("click", () => addExperienceField());
    document.getElementById("btn-add-education").addEventListener("click", () => addEducationField());

    async function loadResume() {
        window._reloadResumePage = loadResume;
        try {
            const res = await apiFetch("/api/resume");
            const data = await res.json();
            baseResume = data;
            
            document.getElementById("resume-summary").value = data.summary || "";
            document.getElementById("resume-skills").value = data.skills ? data.skills.join(", ") : "";
            
            document.getElementById("experience-list").innerHTML = "";
            document.getElementById("education-list").innerHTML = "";
            expCounter = 0;
            eduCounter = 0;
            
            if (data.experience && data.experience.length > 0) {
                data.experience.forEach(exp => addExperienceField(exp));
            } else {
                addExperienceField({
                    company: "Target Valuation & Advisory Services",
                    title: "Equity Research Analyst (Intern)",
                    dates: "Jan 2025 - May 2025",
                    location: "Mumbai, India",
                    bullets: [
                        "Conducted detailed equity research and financial modeling (DCF, Comparable Companies Analysis) for 8 mid-cap retail sector firms.",
                        "Prepared investment thesis reports and sector updates presented to portfolio managers.",
                        "Analyzed balance sheets, income statements, and cash flows to evaluate financial health and debt covenants."
                    ]
                });
            }
            
            if (data.education && data.education.length > 0) {
                data.education.forEach(edu => addEducationField(edu));
            } else {
                addEducationField({
                    school: "Top-Tier University Business School",
                    degree: "Bachelor of Commerce (Honours) / CFA Level I Candidate",
                    dates: "2022 - 2025"
                });
            }
        } catch (e) {
            console.error("Failed to load resume:", e);
        }
    }

    document.getElementById("btn-save-resume").addEventListener("click", async () => {
        const summary = document.getElementById("resume-summary").value.trim();
        const skills = document.getElementById("resume-skills").value.split(",")
            .map(s => s.trim())
            .filter(s => s !== "");
            
        const experience = [];
        const expBlocks = document.querySelectorAll("#experience-list .resume-item-form");
        expBlocks.forEach(block => {
            const company = block.querySelector(".exp-company").value.trim();
            const title = block.querySelector(".exp-title").value.trim();
            const dates = block.querySelector(".exp-dates").value.trim();
            const location = block.querySelector(".exp-location").value.trim();
            
            const bullets = [];
            block.querySelectorAll(".exp-bullet-input").forEach(inp => {
                const val = inp.value.trim();
                if (val) bullets.push(val);
            });
            
            if (company || title) {
                experience.push({ company, title, dates, location, bullets });
            }
        });
        
        const education = [];
        const eduBlocks = document.querySelectorAll("#education-list .resume-item-form");
        eduBlocks.forEach(block => {
            const school = block.querySelector(".edu-school").value.trim();
            const degree = block.querySelector(".edu-degree").value.trim();
            const dates = block.querySelector(".edu-dates").value.trim();
            
            if (school || degree) {
                education.push({ school, degree, dates });
            }
        });
        
        const payload = { summary, experience, education, skills };
        
        try {
            const res = await apiFetch("/api/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast("Base resume saved successfully!", "success");
            }
        } catch (e) {
            showToast("Failed to save resume: " + e.message, "error");
        }
    });

    // ==========================================
    // 3. JOB SCRAPER & LISTING LOGIC
    // ==========================================
    async function loadJobs() {
        try {
            const res = await apiFetch("/api/jobs");
            const jobs = await res.json();
            jobsList = jobs;
            
            const container = document.getElementById("scraped-jobs-container");
            if (jobs.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <p>No jobs added yet. Use the import tool above to add your first job!</p>
                    </div>`;
                document.getElementById("job-details-pane").innerHTML = `
                    <div class="empty-state">
                        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        <p>Select a job from the list to view its description and details</p>
                    </div>`;
                return;
            }
            
            container.innerHTML = jobs.map(job => `
                <div class="glass-card job-item" id="job-item-${job.id}" onclick="selectJobItem('${job.id}')">
                    <div class="job-item-header">
                        <span class="job-item-title">${job.title}</span>
                        <span class="job-badge">${job.source || 'web'}</span>
                    </div>
                    <div class="job-item-company">${job.company}</div>
                </div>
            `).join("");
            
            if (activeJobId && jobs.find(j => j.id === activeJobId)) {
                selectJobItem(activeJobId);
            }
        } catch (e) {
            console.error("Failed to load jobs list:", e);
        }
    }

    window.selectJobItem = async (jobId) => {
        activeJobId = jobId;
        document.querySelectorAll(".job-item").forEach(item => item.classList.remove("selected"));
        
        const selectedEl = document.getElementById(`job-item-${jobId}`);
        if (selectedEl) selectedEl.classList.add("selected");
        
        const job = jobsList.find(j => j.id === jobId);
        if (!job) return;
        
        const detailsPane = document.getElementById("job-details-pane");
        
        let applyButtonHtml = "";
        let appliedInfoHtml = "";
        
        if (job.applied_date) {
            appliedInfoHtml = `
                <div style="border: 1px solid var(--green-border); background: var(--green-soft); padding: 0.85rem; margin-top: 1rem; border-radius: var(--radius-sm);">
                    <p style="font-size:0.9rem; color:var(--green); font-weight:600; margin-bottom:0.4rem; display:flex; align-items:center; gap:0.4rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        Applied with AI on ${job.applied_date}
                    </p>
                    <div style="display:flex; gap:0.5rem;">
                        <a href="/api/apply/download/${job.id}" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; text-decoration:none; color: var(--green); border-color: var(--green-border);">
                            Download Tailored Resume (.docx)
                        </a>
                    </div>
                </div>
            `;
            
            if (job.application_answers) {
                appliedInfoHtml += `
                    <div style="margin-top: 1.25rem; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
                        <h3 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.6rem; color: var(--accent); display:flex; align-items:center; gap:0.4rem;">
                            AI-Drafted Application Answers
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            ${Object.entries(job.application_answers).map(([q, ans]) => `
                                <div style="background: var(--bg-hover); border: 1px solid var(--border-subtle); padding: 0.65rem; border-radius: var(--radius-sm); position:relative;">
                                    <p style="font-size:0.8rem; font-weight:600; color:var(--text-primary); margin-bottom:0.2rem;">${q}</p>
                                    <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.4;">${ans}</p>
                                    <button class="btn btn-secondary" onclick="navigator.clipboard.writeText(\`${ans.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`); showToast('Copied!', 'success');" style="position:absolute; top:0.4rem; right:0.4rem; padding: 0.15rem 0.35rem; font-size:0.65rem;">Copy</button>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                `;
            }
            
            if (job.tailored_resume) {
                if (!baseResume) {
                    try {
                        const res = await apiFetch("/api/resume");
                        baseResume = await res.json();
                    } catch (e) {
                        console.error("Failed to load base resume for comparison:", e);
                    }
                }
                
                const tr = job.tailored_resume;
                
                appliedInfoHtml += `
                    <div style="margin-top: 1.25rem; border-top: 1px solid var(--border-color); padding-top: 0.85rem;">
                        <h3 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--teal); display:flex; align-items:center; gap:0.4rem;">
                            Tailored Resume Preview & Comparison
                        </h3>
                        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.75rem;">
                            Compare your original resume with the tailored version compiled into your docx package.
                        </p>
                        
                        <div class="comparison-layout" style="gap: 1rem;">
                            <!-- Column 1: Base Resume -->
                            <div style="padding: 0.85rem; background: var(--bg-hover); border: 1px solid var(--border-subtle); max-height: 380px; overflow-y: auto; font-size: 0.8rem; border-radius: var(--radius-sm);">
                                <h4 style="font-size: 0.75rem; color: var(--teal); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.2rem; margin-bottom: 0.6rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Original Resume</h4>
                                
                                <div style="margin-bottom: 0.6rem;">
                                    <strong style="color: var(--text-primary); display:block; margin-bottom: 0.15rem; font-size: 0.8rem;">Summary</strong>
                                    <p style="color: var(--text-secondary); line-height: 1.4; font-style: italic; font-size: 0.78rem;">${baseResume ? (baseResume.summary || 'No summary set.') : 'Loading...'}</p>
                                </div>
                                
                                <div style="margin-bottom: 0.6rem;">
                                    <strong style="color: var(--text-primary); display:block; margin-bottom: 0.15rem; font-size: 0.8rem;">Skills</strong>
                                    <div style="display:flex; flex-wrap:wrap; gap: 0.2rem;">
                                        ${baseResume && baseResume.skills ? baseResume.skills.map(s => `<span class="skill-tag" style="background:var(--bg-input); padding: 0.1rem 0.35rem; font-size: 0.65rem; border-radius: 3px;">${s}</span>`).join("") : 'None'}
                                    </div>
                                </div>
                                
                                <div>
                                    <strong style="color: var(--text-primary); display:block; margin-bottom: 0.15rem; font-size: 0.8rem;">Experience</strong>
                                    ${baseResume && baseResume.experience ? baseResume.experience.map(exp => `
                                        <div style="margin-bottom: 0.4rem; border-left: 2px solid var(--border-color); padding-left: 0.4rem;">
                                            <div style="font-weight:600; color: var(--text-primary); font-size: 0.78rem;">${exp.title}</div>
                                            <div style="font-size: 0.7rem; color: var(--text-tertiary);">${exp.company} | ${exp.dates}</div>
                                            <ul style="margin: 0.15rem 0 0 1rem; padding: 0; color: var(--text-secondary); line-height: 1.3; font-size: 0.75rem;">
                                                ${exp.bullets ? exp.bullets.map(b => `<li style="margin-bottom: 0.15rem;">${b}</li>`).join("") : ''}
                                            </ul>
                                        </div>
                                    `).join("") : 'None'}
                                </div>
                            </div>
                            
                            <!-- Column 2: Tailored Resume -->
                            <div style="padding: 0.85rem; background: var(--bg-hover); border: 1px solid var(--border-subtle); max-height: 380px; overflow-y: auto; font-size: 0.8rem; border-radius: var(--radius-sm);">
                                <h4 style="font-size: 0.75rem; color: var(--accent); border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.2rem; margin-bottom: 0.6rem; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Tailored Resume</h4>
                                
                                <div style="margin-bottom: 0.6rem;">
                                    <strong style="color: var(--text-primary); display:block; margin-bottom: 0.15rem; font-size: 0.8rem;">Tailored Summary</strong>
                                    <p style="color: var(--text-secondary); line-height: 1.4; font-style: italic; border-left: 2px solid var(--accent); padding-left: 0.4rem; font-size: 0.78rem;">${tr.summary || ''}</p>
                                </div>
                                
                                <div style="margin-bottom: 0.6rem;">
                                    <strong style="color: var(--text-primary); display:block; margin-bottom: 0.15rem; font-size: 0.8rem;">Skills (Prioritized)</strong>
                                    <div style="display:flex; flex-wrap:wrap; gap: 0.2rem;">
                                        ${tr.skills ? tr.skills.map(s => `<span class="skill-tag matched" style="padding: 0.1rem 0.35rem; font-size: 0.65rem; border-radius: 3px;">${s}</span>`).join("") : ''}
                                    </div>
                                </div>
                                
                                <div>
                                    <strong style="color: var(--text-primary); display:block; margin-bottom: 0.15rem; font-size: 0.8rem;">Tailored Experience</strong>
                                    ${tr.experience ? tr.experience.map(exp => `
                                        <div style="margin-bottom: 0.4rem; border-left: 2px solid var(--accent-border); padding-left: 0.4rem;">
                                            <div style="font-weight:600; color: var(--text-primary); font-size: 0.78rem;">${exp.title}</div>
                                            <div style="font-size: 0.7rem; color: var(--text-tertiary);">${exp.company} | ${exp.dates}</div>
                                            <ul style="margin: 0.15rem 0 0 1rem; padding: 0; color: var(--text-primary); line-height: 1.3; font-size: 0.75rem;">
                                                ${exp.bullets ? exp.bullets.map(b => `<li style="margin-bottom: 0.15rem;">${b}</li>`).join("") : ''}
                                            </ul>
                                        </div>
                                    `).join("") : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        } else {
            applyButtonHtml = `
                <button class="btn btn-primary" id="btn-apply-direct" style="padding: 0.3rem 0.65rem; font-size: 0.8rem;" onclick="applyDirectly('${job.id}')">
                    Apply with AI
                </button>
            `;
        }
        
        detailsPane.innerHTML = `
            <div class="job-details-header">
                <div class="job-details-title-row">
                    <div>
                        <h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 0.15rem;">${job.title}</h2>
                        <h4 style="color: var(--text-secondary); font-weight: 500; font-size: 0.95rem;">${job.company}</h4>
                    </div>
                    <button class="btn btn-danger" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;" onclick="deleteJobDirect('${job.id}')">
                        Delete
                    </button>
                </div>
                <div style="margin-top: 0.85rem; display: flex; gap: 0.5rem; align-items:center;">
                    <a href="${job.url}" target="_blank" class="btn btn-secondary" style="padding: 0.3rem 0.65rem; font-size: 0.8rem; text-decoration: none;">
                        Open Listing &nearr;
                    </a>
                    <button class="btn btn-primary" style="padding: 0.3rem 0.65rem; font-size: 0.8rem;" onclick="navigateToTailoring('${job.id}')">
                        Tailor with AI &rarr;
                    </button>
                    ${applyButtonHtml}
                </div>
                ${appliedInfoHtml}
            </div>
            <div class="job-details-desc">
                ${job.description}
            </div>
        `;
    };

    window.applyDirectly = async (jobId) => {
        const btn = document.getElementById("btn-apply-direct");
        if (!btn) return;
        
        btn.disabled = true;
        const originalText = btn.innerText;
        btn.innerHTML = `<span class="spinner"></span> Applying...`;
        
        try {
            const res = await apiFetch(`/api/apply/${jobId}`, { method: "POST" });
            if (res.ok) {
                const result = await res.json();
                
                const jobsRes = await apiFetch("/api/jobs");
                jobsList = await jobsRes.json();
                
                showToast(result.message, "success");
                selectJobItem(jobId);
            } else {
                const err = await res.json();
                showToast("Application failed: " + err.detail, "error");
                btn.disabled = false;
                btn.innerText = originalText;
            }
        } catch (e) {
            showToast("Connection error: " + e.message, "error");
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };

    window.deleteJobDirect = async (jobId) => {
        if (!confirm("Are you sure you want to delete this job listing?")) return;
        try {
            const res = await apiFetch(`/api/jobs/${jobId}`, { method: "DELETE" });
            if (res.ok) {
                activeJobId = null;
                loadJobs();
                showToast("Job deleted.", "info");
            }
        } catch (e) {
            showToast("Delete failed: " + e.message, "error");
        }
    };

    window.navigateToTailoring = (jobId) => {
        switchPage("tailor");
        setTimeout(() => {
            const select = document.getElementById("tailor-job-select");
            select.value = jobId;
            select.dispatchEvent(new Event("change"));
        }, 100);
    };

    // Make showToast global for inline onclick handlers
    window.showToast = showToast;

    async function handleScrape(urlInputEl, buttonEl, buttonTextEl) {
        const url = urlInputEl.value.trim();
        if (!url) return;
        
        buttonEl.disabled = true;
        const originalText = buttonTextEl.innerText;
        buttonTextEl.innerHTML = `<span class="spinner"></span> Scraping...`;
        
        try {
            const res = await apiFetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url })
            });
            if (res.ok) {
                const newJob = await res.json();
                urlInputEl.value = "";
                closeModal(scrapeDialog);
                activeJobId = newJob.id;
                loadJobs();
                showToast("Job imported successfully!", "success");
            } else {
                const err = await res.json();
                if (err.detail && err.detail.includes("API Key is required")) {
                    openModal(settingsDialog);
                } else {
                    showToast("Scraping failed: " + err.detail, "error");
                }
            }
        } catch (e) {
            showToast("Connection error: " + e.message, "error");
        } finally {
            buttonEl.disabled = false;
            buttonTextEl.innerText = originalText;
        }
    }

    document.getElementById("btn-trigger-scrape").addEventListener("click", () => {
        const inp = document.getElementById("scrape-url-input");
        const btn = document.getElementById("btn-trigger-scrape");
        const btnTxt = document.getElementById("scrape-btn-text");
        handleScrape(inp, btn, btnTxt);
    });

    triggerDialogScrapeBtn.addEventListener("click", () => {
        handleScrape(dialogScrapeUrl, triggerDialogScrapeBtn, triggerDialogScrapeBtn);
    });

    // ==========================================
    // JOB DISCOVERY & SEARCH LOGIC
    // ==========================================
    const tabSavedJobs = document.getElementById("btn-tab-saved-jobs");
    const tabSearchResults = document.getElementById("btn-tab-search-results");
    const savedJobsContainer = document.getElementById("scraped-jobs-container");
    const searchResultsContainer = document.getElementById("search-results-container");

    if (tabSavedJobs && tabSearchResults) {
        tabSavedJobs.addEventListener("click", () => {
            tabSavedJobs.classList.add("active");
            tabSearchResults.classList.remove("active");
            savedJobsContainer.style.display = "block";
            searchResultsContainer.style.display = "none";
        });
        
        tabSearchResults.addEventListener("click", () => {
            tabSearchResults.classList.add("active");
            tabSavedJobs.classList.remove("active");
            searchResultsContainer.style.display = "block";
            savedJobsContainer.style.display = "none";
        });
    }

    const triggerSearchBtn = document.getElementById("btn-trigger-search");
    const searchKeywordsInput = document.getElementById("search-keywords-input");
    const searchLocationInput = document.getElementById("search-location-input");

    if (triggerSearchBtn) {
        triggerSearchBtn.addEventListener("click", async () => {
            const keywords = searchKeywordsInput.value.trim();
            const location = searchLocationInput.value.trim();
            if (!keywords) {
                showToast("Please enter search keywords!", "warning");
                return;
            }
            
            triggerSearchBtn.disabled = true;
            const originalText = triggerSearchBtn.innerText;
            triggerSearchBtn.innerHTML = `<span class="spinner"></span> Searching...`;
            
            if (tabSearchResults) tabSearchResults.click();
            
            try {
                const res = await apiFetch(`/api/search?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}`);
                if (res.ok) {
                    const jobs = await res.json();
                    renderSearchResults(jobs);
                } else {
                    const err = await res.json();
                    showToast("Search failed: " + err.detail, "error");
                }
            } catch (e) {
                showToast("Search connection failed: " + e.message, "error");
            } finally {
                triggerSearchBtn.disabled = false;
                triggerSearchBtn.innerText = originalText;
            }
        });
    }

    function renderSearchResults(jobs) {
        if (!searchResultsContainer) return;
        if (jobs.length === 0) {
            searchResultsContainer.innerHTML = `
                <div class="empty-state">
                    <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <p>No jobs found. Try different keywords or location.</p>
                </div>`;
            return;
        }
        
        searchResultsContainer.innerHTML = jobs.map(job => {
            const isSaved = jobsList.some(sj => sj.url === job.url);
            const buttonHtml = isSaved 
                ? `<span style="font-size:0.7rem; color:var(--green); font-weight:600;">✓ Saved</span>` 
                : `<button class="btn btn-secondary" onclick="importSearchResult(this, '${job.url}')" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;">Import</button>`;
            
            return `
                <div class="glass-card job-item" style="cursor: default;">
                    <div class="job-item-header" style="gap:0.5rem;">
                        <span class="job-item-title" style="cursor:pointer;" onclick="previewSearchJob('${job.title.replace(/'/g, "\\'")}', '${job.company.replace(/'/g, "\\'")}', '${job.location.replace(/'/g, "\\'")}', '${job.url}')">${job.title}</span>
                        <div id="import-btn-wrapper-${job.id}">${buttonHtml}</div>
                    </div>
                    <div class="job-item-company">${job.company} | ${job.location}</div>
                    <div style="margin-top:0.35rem;">
                        <a href="${job.url}" target="_blank" style="color: var(--teal); font-size:0.7rem; text-decoration:none;">View on LinkedIn &nearr;</a>
                    </div>
                </div>
            `;
        }).join("");
    }

    window.previewSearchJob = (title, company, location, url) => {
        const detailsPane = document.getElementById("job-details-pane");
        detailsPane.innerHTML = `
            <div class="job-details-header">
                <div class="job-details-title-row">
                    <div>
                        <h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 0.15rem;">${title}</h2>
                        <h4 style="color: var(--text-secondary); font-weight: 500; font-size: 0.95rem;">${company} | ${location}</h4>
                    </div>
                </div>
                <div style="margin-top: 0.85rem; display: flex; gap: 0.5rem; align-items:center;">
                    <a href="${url}" target="_blank" class="btn btn-secondary" style="padding: 0.3rem 0.65rem; font-size: 0.8rem; text-decoration: none;">
                        Open Listing &nearr;
                    </a>
                    <button class="btn btn-primary" style="padding: 0.3rem 0.65rem; font-size: 0.8rem;" onclick="importSearchResultFromPreview('${url}')">
                        Import to Saved List &rarr;
                    </button>
                </div>
            </div>
            <div class="job-details-desc" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; color:var(--text-tertiary);">
                <p>Job description details will be fetched when imported.</p>
                <p style="font-size:0.75rem; margin-top:0.35rem;">Click "Import to Saved List" to retrieve the full description via AI/Scraper.</p>
            </div>
        `;
    };

    window.importSearchResult = async (btnEl, url) => {
        const originalHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = `<span class="spinner" style="width:10px; height:10px;"></span>`;
        
        try {
            const res = await apiFetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url })
            });
            if (res.ok) {
                const newJob = await res.json();
                btnEl.parentElement.innerHTML = `<span style="font-size:0.7rem; color:var(--green); font-weight:600;">✓ Saved</span>`;
                activeJobId = newJob.id;
                loadJobs();
                selectJobItem(newJob.id);
                if (tabSavedJobs) tabSavedJobs.click();
            } else {
                const err = await res.json();
                showToast("Import failed: " + err.detail, "error");
                btnEl.disabled = false;
                btnEl.innerHTML = originalHtml;
            }
        } catch (e) {
            showToast("Connection error: " + e.message, "error");
            btnEl.disabled = false;
            btnEl.innerHTML = originalHtml;
        }
    };

    window.importSearchResultFromPreview = async (url) => {
        const detailsPane = document.getElementById("job-details-pane");
        detailsPane.innerHTML = `
            <div class="empty-state" style="height:300px;">
                <span class="spinner" style="width:36px; height:36px; border-width:3px; margin-bottom:0.75rem;"></span>
                <p>Importing and scraping job details...</p>
            </div>
        `;
        
        try {
            const res = await apiFetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url })
            });
            if (res.ok) {
                const newJob = await res.json();
                activeJobId = newJob.id;
                loadJobs();
                if (tabSavedJobs) tabSavedJobs.click();
                selectJobItem(newJob.id);
            } else {
                const err = await res.json();
                showToast("Import failed: " + err.detail, "error");
                loadJobs();
            }
        } catch (e) {
            showToast("Connection error: " + e.message, "error");
            loadJobs();
        }
    };

    // ==========================================
    // 4. TAILORING STUDIO LOGIC
    // ==========================================
    const tailorSelect = document.getElementById("tailor-job-select");
    const runAnalysisBtn = document.getElementById("btn-run-analysis");
    const tailorWorkspace = document.getElementById("tailor-workspace");
    const tabButtons = document.querySelectorAll(".tailor-tabs .tab-btn");
    const tabContents = document.querySelectorAll(".tailor-content");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");
            if (!tabId) return;
            tabButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));
            
            btn.classList.add("active");
            document.getElementById(`tab-${tabId}`).classList.add("active");

            if (tabId === "resume-tailor") {
                renderOriginalResumePreview();
                renderTailoredResumePreview();
            } else if (tabId === "cover-letter") {
                renderCoverLetterPreview();
            }
        });
    });

    async function loadTailorDropdown() {
        try {
            const res = await apiFetch("/api/jobs");
            const jobs = await res.json();
            
            tailorSelect.innerHTML = `<option value="">-- Choose a job --</option>` + 
                jobs.map(j => `<option value="${j.id}">${j.company} - ${j.title}</option>`).join("");
                
            runAnalysisBtn.disabled = true;
            tailorWorkspace.style.display = "none";
        } catch (e) {
            console.error("Dropdown load failed:", e);
        }
    }

    tailorSelect.addEventListener("change", () => {
        const val = tailorSelect.value;
        if (val) {
            runAnalysisBtn.disabled = false;
            
            const job = jobsList.find(j => j.id === val);
            if (job && job.analysis) {
                tailorWorkspace.style.display = "block";
                renderAnalysisResults(job.analysis);
            } else {
                tailorWorkspace.style.display = "none";
            }
        } else {
            runAnalysisBtn.disabled = true;
            tailorWorkspace.style.display = "none";
        }
    });

    runAnalysisBtn.addEventListener("click", async () => {
        const jobId = tailorSelect.value;
        if (!jobId) return;

        if (!hasApiKey) {
            openModal(settingsDialog);
            return;
        }

        runAnalysisBtn.disabled = true;
        const originalText = runAnalysisBtn.innerText;
        runAnalysisBtn.innerHTML = `<span class="spinner"></span> Analyzing...`;
        tailorWorkspace.style.display = "none";

        try {
            const res = await apiFetch(`/api/analyze/${jobId}`, { method: "POST" });
            if (res.ok) {
                const analysis = await res.json();
                
                const jobsRes = await apiFetch("/api/jobs");
                jobsList = await jobsRes.json();
                
                tailorWorkspace.style.display = "block";
                renderAnalysisResults(analysis);
            } else {
                const err = await res.json();
                showToast("Analysis failed: " + err.detail, "error");
            }
        } catch (e) {
            showToast("Analysis failed: " + e.message, "error");
        } finally {
            runAnalysisBtn.disabled = false;
            runAnalysisBtn.innerText = originalText;
        }
    });

    function renderAnalysisResults(analysis) {
        const score = analysis.match_score || 0;
        const scoreRadial = document.getElementById("analysis-radial");
        const scoreText = document.getElementById("analysis-score-text");
        const scoreDesc = document.getElementById("analysis-score-desc");
        
        // Animate score from 0 to target
        let currentScore = 0;
        const duration = 1500; // ms
        const fps = 60;
        const steps = duration / (1000 / fps);
        const increment = score / steps;
        
        if (scoreRadial._animationInterval) {
            clearInterval(scoreRadial._animationInterval);
        }
        
        scoreRadial._animationInterval = setInterval(() => {
            currentScore += increment;
            if (currentScore >= score) {
                currentScore = score;
                clearInterval(scoreRadial._animationInterval);
                scoreRadial._animationInterval = null;
            }
            const displayScore = Math.floor(currentScore);
            scoreRadial.style.setProperty("--score", `${displayScore}%`);
            scoreText.innerText = `${displayScore}%`;
        }, 1000 / fps);
        
        if (score >= 80) {
            scoreDesc.innerText = "Excellent Match";
            scoreDesc.style.color = "var(--green)";
        } else if (score >= 60) {
            scoreDesc.innerText = "Good Match";
            scoreDesc.style.color = "var(--orange)";
        } else {
            scoreDesc.innerText = "Needs Improvement";
            scoreDesc.style.color = "var(--red)";
        }

        const highlightsContainer = document.getElementById("analysis-highlights");
        if (analysis.key_highlights && analysis.key_highlights.length > 0) {
            highlightsContainer.innerHTML = analysis.key_highlights.map(hl => `
                <div class="point-item">
                    <svg class="point-icon bullet" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>${hl}</span>
                </div>
            `).join("");
        } else {
            highlightsContainer.innerHTML = `<span style="font-size:0.85rem; color:var(--text-tertiary);">No highlights generated.</span>`;
        }

        const matchSkillsContainer = document.getElementById("analysis-matching-skills");
        if (analysis.matching_skills && analysis.matching_skills.length > 0) {
            matchSkillsContainer.innerHTML = analysis.matching_skills.map(s => `
                <span class="skill-tag matched">${s}</span>
            `).join("");
        } else {
            matchSkillsContainer.innerHTML = `<span style="font-size:0.8rem; color:var(--text-tertiary);">None identified.</span>`;
        }

        const missingSkillsContainer = document.getElementById("analysis-missing-skills");
        if (analysis.missing_skills && analysis.missing_skills.length > 0) {
            missingSkillsContainer.innerHTML = analysis.missing_skills.map(s => `
                <span class="skill-tag missing">${s}</span>
            `).join("");
        } else {
            missingSkillsContainer.innerHTML = `<span style="font-size:0.8rem; color:var(--text-tertiary);">None identified. Perfect match!</span>`;
        }

        const feedbackContainer = document.getElementById("analysis-feedback-points");
        if (analysis.feedback && analysis.feedback.length > 0) {
            feedbackContainer.innerHTML = analysis.feedback.map(pt => `
                <div class="point-item">
                    <svg class="point-icon warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span>${pt}</span>
                </div>
            `).join("");
        } else {
            feedbackContainer.innerHTML = `<div class="point-item"><span>Your resume is already highly optimized for this job listing.</span></div>`;
        }
    }

    async function renderOriginalResumePreview() {
        try {
            const res = await apiFetch("/api/resume");
            const resume = await res.json();
            
            const container = document.getElementById("comparison-original-resume");
            
            let html = `
                <div class="preview-resume-section">
                    <h4>Professional Summary</h4>
                    <p class="preview-resume-summary">${resume.summary || 'No summary set.'}</p>
                </div>
                
                <div class="preview-resume-section">
                    <h4>Skills</h4>
                    <div class="skills-list">
                        ${resume.skills ? resume.skills.map(s => `<span class="skill-tag" style="background:var(--bg-input);">${s}</span>`).join("") : 'None set'}
                    </div>
                </div>
                
                <div class="preview-resume-section">
                    <h4>Work Experience</h4>
                    ${resume.experience ? resume.experience.map(exp => `
                        <div class="preview-job-item">
                            <div class="preview-job-title">${exp.title}</div>
                            <div class="preview-job-meta">${exp.company} | ${exp.dates} | ${exp.location}</div>
                            <ul class="preview-job-bullets">
                                ${exp.bullets ? exp.bullets.map(b => `<li>${b}</li>`).join("") : ''}
                            </ul>
                        </div>
                    `).join("") : 'None set'}
                </div>
            `;
            container.innerHTML = html;
        } catch (e) {
            console.error("Original resume preview failed:", e);
        }
    }

    const triggerTailoringBtn = document.getElementById("btn-trigger-tailoring");
    
    triggerTailoringBtn.addEventListener("click", async () => {
        const jobId = tailorSelect.value;
        if (!jobId) return;

        triggerTailoringBtn.disabled = true;
        const originalText = triggerTailoringBtn.innerText;
        triggerTailoringBtn.innerHTML = `<span class="spinner"></span> Rewriting...`;

        try {
            const res = await apiFetch(`/api/tailor/${jobId}`, { method: "POST" });
            if (res.ok) {
                const jobsRes = await apiFetch("/api/jobs");
                jobsList = await jobsRes.json();
                
                renderTailoredResumePreview();
                showToast("Resume tailored successfully!", "success");
            } else {
                const err = await res.json();
                showToast("Tailoring failed: " + err.detail, "error");
            }
        } catch (e) {
            showToast("Tailoring failed: " + e.message, "error");
        } finally {
            triggerTailoringBtn.disabled = false;
            triggerTailoringBtn.innerText = originalText;
        }
    });

    function renderTailoredResumePreview() {
        const jobId = tailorSelect.value;
        const job = jobsList.find(j => j.id === jobId);
        const container = document.getElementById("comparison-tailored-resume");
        const copyBtn = document.getElementById("btn-copy-tailored-resume");
        
        if (!job || !job.tailored_resume) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <p>Click "Tailor Resume" above to generate tailored copy and bullet points.</p>
                </div>`;
            copyBtn.style.display = "none";
            return;
        }
        
        const tr = job.tailored_resume;
        copyBtn.style.display = "block";
        
        let html = `
            <div class="preview-resume-section">
                <h4>Tailored Summary</h4>
                <p class="preview-resume-summary" style="border-left: 2px solid var(--accent); padding-left: 0.65rem; font-style: italic;">${tr.summary || ''}</p>
            </div>
            
            <div class="preview-resume-section">
                <h4>Suggested Skills Priority</h4>
                <div class="skills-list">
                    ${tr.skills ? tr.skills.map(s => `<span class="skill-tag matched">${s}</span>`).join("") : ''}
                </div>
            </div>
            
            <div class="preview-resume-section">
                <h4>Tailored Work Experience</h4>
                ${tr.experience ? tr.experience.map(exp => `
                    <div class="preview-job-item">
                        <div class="preview-job-title">${exp.title}</div>
                        <div class="preview-job-meta">${exp.company} | ${exp.dates} | ${exp.location}</div>
                        <ul class="preview-job-bullets">
                            ${exp.bullets ? exp.bullets.map(b => `<li style="font-weight:500; margin-bottom:0.3rem;">${b}</li>`).join("") : ''}
                        </ul>
                    </div>
                `).join("") : ''}
            </div>
        `;
        container.innerHTML = html;
        
        copyBtn.onclick = () => {
            let text = `PROFESSIONAL SUMMARY\n${tr.summary}\n\nSKILLS\n${tr.skills.join(", ")}\n\nEXPERIENCE\n`;
            tr.experience.forEach(exp => {
                text += `${exp.title} - ${exp.company} (${exp.dates})\n`;
                exp.bullets.forEach(b => {
                    text += `* ${b}\n`;
                });
                text += `\n`;
            });
            
            navigator.clipboard.writeText(text).then(() => {
                showToast("Tailored resume text copied!", "success");
            });
        };
    }

    // Cover Letter Generator
    const triggerCoverLetterBtn = document.getElementById("btn-trigger-cover-letter");
    const coverLetterOutput = document.getElementById("cover-letter-output");
    const coverLetterEmptyState = document.getElementById("cover-letter-empty-state");
    const copyCoverLetterBtn = document.getElementById("btn-copy-cover-letter");

    triggerCoverLetterBtn.addEventListener("click", async () => {
        const jobId = tailorSelect.value;
        if (!jobId) return;

        triggerCoverLetterBtn.disabled = true;
        const originalText = triggerCoverLetterBtn.innerText;
        triggerCoverLetterBtn.innerHTML = `<span class="spinner"></span> Generating...`;
        
        try {
            const res = await apiFetch(`/api/cover-letter/${jobId}`, { method: "POST" });
            if (res.ok) {
                const jobsRes = await apiFetch("/api/jobs");
                jobsList = await jobsRes.json();
                
                renderCoverLetterPreview();
                showToast("Cover letter generated!", "success");
            } else {
                const err = await res.json();
                showToast("Cover letter generation failed: " + err.detail, "error");
            }
        } catch (e) {
            showToast("Cover letter generation failed: " + e.message, "error");
        } finally {
            triggerCoverLetterBtn.disabled = false;
            triggerCoverLetterBtn.innerText = originalText;
        }
    });

    function renderCoverLetterPreview() {
        const jobId = tailorSelect.value;
        const job = jobsList.find(j => j.id === jobId);
        
        if (!job || !job.cover_letter) {
            coverLetterOutput.style.display = "none";
            coverLetterEmptyState.style.display = "flex";
            copyCoverLetterBtn.style.display = "none";
            return;
        }
        
        coverLetterOutput.style.display = "block";
        coverLetterEmptyState.style.display = "none";
        copyCoverLetterBtn.style.display = "inline-flex";
        
        coverLetterOutput.innerText = job.cover_letter;
        
        copyCoverLetterBtn.onclick = () => {
            const text = coverLetterOutput.innerText;
            navigator.clipboard.writeText(text).then(() => {
                showToast("Cover letter copied!", "success");
            });
        };
    }

    // ==========================================
    // 5. KANBAN TRACKER LOGIC
    // ==========================================
    async function loadKanbanBoard() {
        try {
            const res = await apiFetch("/api/tracker");
            const board = await res.json();
            
            const stages = ["wishlist", "applied", "interviewing", "offer", "rejected"];
            
            stages.forEach(stage => {
                document.getElementById(`count-${stage}`).innerText = board[stage].length;
                
                const container = document.getElementById(`cards-${stage}`);
                container.innerHTML = "";
                
                if (board[stage].length === 0) return;
                
                board[stage].forEach(item => {
                    const hasScore = typeof item.match_score === "number";
                    const scoreClass = hasScore && item.match_score < 60 ? "low" : "";
                    
                    const cardHtml = `
                        <div class="kanban-card" draggable="true" id="kanban-card-${item.id}" data-id="${item.id}" data-stage="${stage}">
                            <div class="kanban-card-title">${item.title}</div>
                            <div class="kanban-card-company">${item.company}</div>
                            <div class="kanban-card-footer">
                                <a href="${item.url}" target="_blank" style="color: var(--teal); text-decoration: none;">Link &nearr;</a>
                                ${hasScore ? `<span class="kanban-card-score ${scoreClass}">Match: ${item.match_score}%</span>` : ""}
                            </div>
                        </div>
                    `;
                    container.insertAdjacentHTML("beforeend", cardHtml);
                });
            });
            
            setupDragAndDrop();
        } catch (e) {
            console.error("Failed to load Kanban board:", e);
        }
    }

    function setupDragAndDrop() {
        const cards = document.querySelectorAll(".kanban-card");
        const columns = document.querySelectorAll(".column-cards");
        
        cards.forEach(card => {
            card.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", card.getAttribute("data-id"));
                e.dataTransfer.setData("from-stage", card.getAttribute("data-stage"));
                setTimeout(() => { card.style.opacity = "0.4"; }, 0);
            });
            
            card.addEventListener("dragend", () => {
                card.style.opacity = "1";
            });
        });
        
        columns.forEach(col => {
            const stage = col.parentElement.getAttribute("data-stage");
            
            col.addEventListener("dragover", (e) => {
                e.preventDefault();
                col.classList.add("dragover");
            });
            
            col.addEventListener("dragleave", () => {
                col.classList.remove("dragover");
            });
            
            col.addEventListener("drop", async (e) => {
                e.preventDefault();
                col.classList.remove("dragover");
                
                const jobId = e.dataTransfer.getData("text/plain");
                const fromStage = e.dataTransfer.getData("from-stage");
                const toStage = stage;
                
                if (fromStage === toStage) return;
                
                const card = document.getElementById(`kanban-card-${jobId}`);
                if (card) {
                    card.setAttribute("data-stage", toStage);
                    col.appendChild(card);
                    
                    const fromCountEl = document.getElementById(`count-${fromStage}`);
                    const toCountEl = document.getElementById(`count-${toStage}`);
                    fromCountEl.innerText = parseInt(fromCountEl.innerText) - 1;
                    toCountEl.innerText = parseInt(toCountEl.innerText) + 1;
                }
                
                try {
                    const res = await apiFetch("/api/tracker/move", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            job_id: jobId,
                            from_stage: fromStage,
                            to_stage: toStage
                        })
                    });
                    if (!res.ok) {
                        loadKanbanBoard();
                    }
                } catch (e) {
                    console.error("Failed to move card:", e);
                    loadKanbanBoard();
                }
            });
        });
    }

    // ==========================================
    // DOCX Upload Handlers (Moved inside DOMContentLoaded for apiFetch scope)
    // ==========================================
    function handleDocxDrop(event) {
        event.preventDefault();
        const zone = document.getElementById("resume-upload-zone");
        zone.classList.remove("dragover");

        const files = event.dataTransfer.files;
        if (files.length > 0) {
            uploadDocxFile(files[0]);
        }
    }

    function handleDocxFileSelect(event) {
        const files = event.target.files;
        if (files.length > 0) {
            uploadDocxFile(files[0]);
        }
    }

    async function uploadDocxFile(file) {
        if (!file.name.endsWith(".docx")) {
            showUploadToast("Only .docx Word document files are supported.", "error");
            return;
        }

        const zone = document.getElementById("resume-upload-zone");
        const statusText = document.getElementById("upload-status-text");
        const uploadIcon = document.getElementById("upload-icon");

        zone.style.borderColor = "var(--teal-border)";
        zone.style.background = "var(--teal-soft)";
        uploadIcon.setAttribute("stroke", "var(--teal)");
        statusText.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.6rem;">
                <span class="spinner" style="width: 20px; height: 20px; border-color: var(--border-color); border-top-color: var(--teal);"></span>
                <span style="font-size: 0.9rem; font-weight: 600; color: var(--teal);">Uploading & parsing with AI...</span>
            </div>
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.35rem;">${file.name}</p>
        `;

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await apiFetch("/api/resume/upload", {
                method: "POST",
                body: formData
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || "Upload failed");
            }

            zone.style.borderColor = "var(--green-border)";
            zone.style.background = "var(--green-soft)";
            uploadIcon.setAttribute("stroke", "var(--green)");

            const parseMethod = data._parse_method === "gemini" ? "Parsed intelligently with AI" : "Basic extraction (set API key for full parsing)";
            const parseColor = data._parse_method === "gemini" ? "var(--green)" : "var(--orange)";

            statusText.innerHTML = `
                <p style="font-size: 0.95rem; font-weight: 600; color: var(--green); margin-bottom: 0.15rem;">✓ Resume Successfully Imported!</p>
                <p style="font-size: 0.75rem; color: var(--text-secondary);">${file.name}</p>
                <p style="font-size: 0.75rem; color: ${parseColor}; margin-top: 0.2rem;">${parseMethod}</p>
                <p style="font-size: 0.7rem; color: var(--text-tertiary); margin-top: 0.35rem;">Click or drag a new file to re-upload</p>
            `;

            if (data._parse_warning) {
                showUploadToast(data._parse_warning, "warning");
            } else {
                showUploadToast("Resume imported! All fields have been populated below.", "success");
            }

            setTimeout(() => {
                window._reloadResumePage && window._reloadResumePage();
            }, 500);

        } catch (err) {
            zone.style.borderColor = "var(--red-border)";
            zone.style.background = "var(--red-soft)";
            uploadIcon.setAttribute("stroke", "var(--red)");
            statusText.innerHTML = `
                <p style="font-size: 0.95rem; font-weight: 600; color: var(--red);">Upload Failed</p>
                <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem;">${err.message}</p>
                <p style="font-size: 0.7rem; color: var(--text-tertiary); margin-top: 0.35rem;">Click to try again</p>
            `;
            showUploadToast("Upload failed: " + err.message, "error");
        }
    }

    function showUploadToast(message, type = "success") {
        if (typeof showToast === "function") {
            showToast(message, type);
            return;
        }
        const existing = document.getElementById("upload-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "upload-toast";
        toast.className = `toast ${type}`;
        toast.innerText = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.3s";
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    window.handleDocxDrop = handleDocxDrop;
    window.handleDocxFileSelect = handleDocxFileSelect;
    window.uploadDocxFile = uploadDocxFile;

    // Start App
    checkSettingsStatus();
    loadDashboardStats();
});
