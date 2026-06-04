-- Create profiles table
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    agency_name TEXT,
    email TEXT,
    logo_url TEXT,
    brand_primary_color TEXT DEFAULT '#0EA5E9',
    brand_accent_color TEXT DEFAULT '#06FFA5',
    brand_font TEXT DEFAULT 'DM Sans',
    ai_tone TEXT DEFAULT 'professional' CONSTRAINT check_ai_tone CHECK (ai_tone IN ('professional', 'friendly', 'concise')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create clients table
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    industry TEXT,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create integrations table
CREATE TABLE public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    platform TEXT NOT NULL CONSTRAINT check_platform CHECK (platform IN ('meta_ads', 'google_ads', 'ga4', 'search_console')),
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_client_platform UNIQUE (client_id, platform)
);

-- Create reports table
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT DEFAULT 'draft' CONSTRAINT check_status CHECK (status IN ('draft', 'generating', 'ready', 'sent', 'failed')),
    pdf_url TEXT,
    pdf_key TEXT,
    ai_summary TEXT,
    metrics_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    generated_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ
);

-- Create report_sections table
CREATE TABLE public.report_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE NOT NULL,
    platform TEXT NOT NULL CONSTRAINT check_section_platform CHECK (platform IN ('meta_ads', 'google_ads', 'ga4', 'search_console')),
    metrics JSONB NOT NULL,
    ai_commentary TEXT,
    is_visible BOOLEAN DEFAULT TRUE,
    order_index INTEGER NOT NULL,
    CONSTRAINT unique_report_section UNIQUE (report_id, platform)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_sections ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY select_own_profile ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY update_own_profile ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY insert_own_profile ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Clients Policies
CREATE POLICY crud_own_clients ON public.clients
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Integrations Policies
CREATE POLICY crud_own_integrations ON public.integrations
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reports Policies
CREATE POLICY crud_own_reports ON public.reports
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Report Sections Policies
CREATE POLICY crud_own_report_sections ON public.report_sections
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.reports
            WHERE public.reports.id = public.report_sections.report_id
              AND public.reports.user_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.reports
            WHERE public.reports.id = public.report_sections.report_id
              AND public.reports.user_id = auth.uid()
        )
    );

-- Trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, agency_name)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', ''),
        new.email,
        COALESCE(new.raw_user_meta_data->>'agency_name', '')
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Performance Indexes
CREATE INDEX idx_clients_user_id ON public.clients(user_id);
CREATE INDEX idx_integrations_user_id ON public.integrations(user_id);
CREATE INDEX idx_integrations_client_id ON public.integrations(client_id);
CREATE INDEX idx_reports_user_id ON public.reports(user_id);
CREATE INDEX idx_reports_client_id ON public.reports(client_id);
CREATE INDEX idx_report_sections_report_id ON public.report_sections(report_id);
