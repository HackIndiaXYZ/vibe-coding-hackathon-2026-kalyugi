# ReportAI — AI-Powered Client Reporting SaaS

ReportAI is a production-ready, full-stack client reporting platform built specifically for Indian digital marketing agencies. It automatically gathers performance metrics from Google Analytics 4, Google Ads, Meta Ads Manager, and Google Search Console, generates executive commentary using Anthropic's Claude API, compiles print-ready PDFs in memory, and hosts them on Cloudflare R2 for sharing via Resend Email and WhatsApp. 

The entire platform is designed to run 100% on **free-tier infrastructure**.

---

## 🛠️ Technology Stack

- **Frontend & Routing**: React 18, Tailwind CSS v4, Next.js 14 (App Router)
- **Database & Authentication**: Supabase (PostgreSQL + Supabase Auth + Row Level Security)
- **Storage**: Cloudflare R2 (S3-compatible bucket storing PDF files)
- **Email Delivery**: Resend (Transactional emails with PDF attachments)
- **AI Core**: Anthropic Claude API (`claude-sonnet-4-20250514`) for data commentary
- **PDF Compiler**: `@react-pdf/renderer` running server-side in Node.js
- **Form Validation**: Zod schemas for sanitizing input data

---

## 💎 Features

- **Premium Interface**: Neon dark theme styled with dynamic layouts, micro-interactions, 3D hover transforms, and a WebGL breathing mesh gradient background.
- **Client & Integration Manager**: Individual data source configuration (GA4 Property IDs, Google Ads Customer IDs, Meta Ad Account IDs, Search Console URLs) isolated per client using custom state JWT validation.
- **Report Generation Wizard**: Multi-step flow supporting inline client creation, date presets, active platform selection, integration health checks, and a full-screen loading compilation overlay.
- **Interactive Report Viewer & Editor**: Live preview of compiled reports, grids displaying aggregated channel metrics, and sub-performance tables.
- **Direct PDF Rebuilds**: Allows inline edits to AI summaries and platform commentaries, automatically re-rendering the PDF, uploading the updated version to Cloudflare R2, and updating the database.
- **Multi-Channel Sharing**: Modals for emailing signed PDF links directly through Resend and pre-formatted text links to WhatsApp.
- **Privacy Protections**: Anonymizes all metrics and strips PII (names, URLs, account IDs) before sending them to the Anthropic API.
- **Security & RLS**: Enforces Row-Level Security (RLS) across all PostgreSQL tables, checking ownership via `auth.uid() = user_id`.

---

## 📂 Project Structure

```text
├── app/
│   ├── api/                    # Server-side API endpoints
│   │   ├── auth/               # Supabase Auth callback & profile endpoints
│   │   ├── clients/            # Client CRUD handlers
│   │   ├── oauth/              # Google & Meta OAuth authorization flow routes
│   │   └── reports/            # Generate, retrieve, send email, and WhatsApp endpoints
│   ├── dashboard/              # Agency Dashboard page (reports list & widgets)
│   ├── integrations/           # Platform connection manager dashboard
│   ├── reports/
│   │   ├── [id]/               # Report detailed preview, editor, and sharing page
│   │   └── generate/           # Interactive report wizard
│   ├── globals.css             # Tailwind v4 directives and custom glass styles
│   ├── layout.tsx              # Root HTML wrapper and global typography configurations
│   └── page.tsx                # Dynamic login page with WebGL shader
├── lib/
│   ├── ai/                     # Claude API caller, prompts, and PII scrubber
│   ├── email/                  # Resend templates and sender logic
│   ├── encryption/             # AES-256-GCM encryption for API tokens
│   ├── middleware/             # Rate limiter and Auth JWT checker
│   ├── pdf/                    # react-pdf SVG components and report template
│   ├── platforms/              # API connectors (GA4, Google Ads, Meta Ads, Search Console)
│   └── supabase/               # Scoped client initialization and mock offline fallback
├── supabase/
│   └── migrations/             # PostgreSQL database schemas and RLS policies
├── tailwind.config.js          # Tailored design tokens and animations
└── postcss.config.js           # Tailwind v4 PostCSS configuration
```

---

## 🔑 Environment Configuration

Create a `.env` file in the root directory based on the `.env.example` template:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Token Encryption Key (64-character hex string representing 32 bytes)
ENCRYPTION_KEY=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f

# Anthropic Claude API Key
ANTHROPIC_API_KEY=sk-ant-api03-your-key

# Cloudflare R2 Configuration
CLOUDFLARE_R2_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-r2-access-key-id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
CLOUDFLARE_R2_BUCKET_NAME=your-r2-bucket-name

# Resend Transactional Email API Key
RESEND_API_KEY=re_your_api_key

# Google OAuth Integration Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Meta Ads OAuth Integration Configuration
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret

# Next.js Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🚀 Getting Started

The platform includes a built-in **Offline Mock Supabase Fallback** that automatically activates if the remote Supabase API is offline, unreachable, or not fully configured in your environment. In this mode, the application runs 100% locally with a pre-seeded in-memory database.

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional for Demo)
Create a `.env` file in the root directory based on the `.env.example` template. If you want to run purely offline in demo mode, you can skip configuring real keys, as the application will automatically fall back to mock data for all database, AI, and storage actions.

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Log In
Use the default test credentials:
- **Email**: `test@agency.com`
- **Password**: `password123` (or any string)

---

## 🧬 Database Migrations (For Live Production)
If connecting to a live Supabase instance:
Copy the SQL script in `supabase/migrations/20260604000000_schema.sql` and run it in your Supabase project's SQL Editor. This will:
- Set up PostgreSQL tables (`profiles`, `clients`, `integrations`, `reports`, `report_sections`).
- Configure Row Level Security (RLS) policies.
- Establish triggers to automatically sync signups into the user profile table.

---

## 🧪 Production Compilation

To compile and verify type-safety for production deployment:

```bash
# Typecheck
npx tsc --noEmit

# Production Build
npm run build
```

This compiles optimized bundles for React pages and configures the dynamic API endpoints to run as on-demand serverless routes.
