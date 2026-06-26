-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    summary TEXT,
    experience JSONB DEFAULT '[]'::jsonb,
    education JSONB DEFAULT '[]'::jsonb,
    skills JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own profile" 
ON public.profiles FOR DELETE 
USING (auth.uid() = id);


-- 2. Create settings table
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    gemini_api_key TEXT DEFAULT '',
    openrouter_api_key TEXT DEFAULT '',
    provider TEXT DEFAULT 'gemini',
    model_name TEXT DEFAULT 'gemini-2.5-flash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Settings Policies
CREATE POLICY "Users can insert their own settings" 
ON public.settings FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own settings" 
ON public.settings FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update their own settings" 
ON public.settings FOR UPDATE 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own settings" 
ON public.settings FOR DELETE 
USING (auth.uid() = id);


-- 3. Create jobs table
CREATE TABLE IF NOT EXISTS public.jobs (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT,
    url TEXT,
    source TEXT,
    questions JSONB DEFAULT '[]'::jsonb,
    location TEXT,
    analysis JSONB,
    tailored_resume JSONB,
    tailored_resume_path TEXT,
    cover_letter TEXT,
    applied_date TEXT,
    application_answers JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Jobs Policies
CREATE POLICY "Users can insert their own jobs" 
ON public.jobs FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own jobs" 
ON public.jobs FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs" 
ON public.jobs FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs" 
ON public.jobs FOR DELETE 
USING (auth.uid() = user_id);


-- 4. Create applications table
CREATE TABLE IF NOT EXISTS public.applications (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    stage TEXT DEFAULT 'wishlist' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, job_id)
);

-- Enable RLS on applications
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Applications Policies
CREATE POLICY "Users can insert their own applications" 
ON public.applications FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own applications" 
ON public.applications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own applications" 
ON public.applications FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications" 
ON public.applications FOR DELETE 
USING (auth.uid() = user_id);
