# CareerGuide Development Plan

## Overview

CareerGuide is an AI-powered platform that generates personalized career roadmaps, helping users navigate from their current situation to their dream career with actionable steps, verified training, and industry-recognized credentials.

**Hosting:** GitHub Pages (static site) with Backend-as-a-Service providers

---

## Architecture: GitHub Pages + BaaS

Since GitHub Pages only serves static files, we'll use a JAMstack architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Pages                             │
│              (Static React/Vite App)                        │
│         https://shieldsbw.github.io/CareerGuide             │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Supabase    │  │   Supabase    │  │  Perplexity   │
│     Auth      │  │   Database    │  │     API       │
│  (Free Tier)  │  │  (Free Tier)  │  │ (via Edge Fn) │
└───────────────┘  └───────────────┘  └───────────────┘
                            │
                            ▼
                   ┌───────────────┐
                   │   Supabase    │
                   │Edge Functions │
                   │ (API Proxy)   │
                   └───────────────┘
```

### Why Perplexity API?

Perplexity is ideal for CareerGuide because it combines AI reasoning with **built-in web search**:
- Searches current job market data, salary info, and training resources in real-time
- Returns responses with **source citations** (important for credibility)
- Single API call handles both research and response generation
- Cost-effective: ~$0.05 per roadmap generation

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Vite | Fast static site, deploys to GitHub Pages |
| **Styling** | Tailwind CSS | Rapid UI development |
| **Routing** | React Router | Client-side navigation |
| **Auth** | Supabase Auth | Google/GitHub/Email login (free tier) |
| **Database** | Supabase PostgreSQL | User data, roadmaps, progress (free tier: 500MB) |
| **AI API Proxy** | Supabase Edge Functions | Securely call Perplexity API without exposing keys |
| **AI + Search** | Perplexity API (sonar-pro) | Research-driven roadmap generation with web search |
| **Hosting** | GitHub Pages | Free static hosting |

### Why This Stack?

- **GitHub Pages**: Free, automatic deploys from repo, custom domain support
- **Supabase**: Generous free tier (50K monthly active users, 500MB database, 500K edge function invocations)
- **Vite + React**: Fast builds, easy GitHub Pages deployment, great developer experience
- **No server to manage**: Everything is either static or managed services

---

## Phase 1: Foundation (MVP)

### 1.1 Project Setup
- Initialize Vite + React + TypeScript project
- Configure GitHub Actions for automatic deployment to GitHub Pages
- Set up Supabase project (auth + database)
- Configure environment variables (Supabase keys in frontend, AI keys in Edge Functions only)

### 1.2 User Authentication
- Supabase Auth integration
- Login options: Google, GitHub, Email/Password
- Protected routes for authenticated users
- User profile storage in Supabase

### 1.3 User Onboarding Flow
Build a multi-step intake wizard that collects:
- Current career/job title
- Work history (years of experience, industries)
- Education level
- General financial situation (income bracket, monthly savings capacity)
- Weekly hours available for upskilling
- Learning style preference (video, reading, hands-on, mixed)
- Target career goal
- Desired timeframe

Store responses in Supabase `user_profiles` table.

### 1.4 AI Roadmap Engine (Perplexity API)
- Create Supabase Edge Function to proxy Perplexity API calls (keeps API key secure)
- Use `sonar-pro` model for research-driven responses with web search
- Perplexity will search for:
  - Current job market requirements for target career
  - Salary ranges and job demand in user's location
  - Recommended training programs, courses, certifications
  - Realistic timelines based on similar career transitions
- Prompt engineering for consistent, actionable roadmap output
- Output format:
  - Gap analysis (current skills vs. required skills)
  - Milestone-based roadmap with timelines
  - Resource recommendations **with source citations**
  - Realistic vs. desired timeline comparison

### 1.5 User Dashboard
- View generated roadmap
- Track progress on milestones
- Update profile/preferences
- Regenerate or adjust plan

**Deliverable:** Working MVP on GitHub Pages where users can sign up, complete intake, receive AI-generated roadmap, and track progress.

---

## Phase 2: Learning & Assessment

### 2.1 Resource Integration
- Curated resource database (stored in Supabase)
- Links to learning platforms: Coursera, Udemy, YouTube, LinkedIn Learning
- Industry-specific resources by career path
- Mark resources as completed

### 2.2 Assessment System
- Multiple choice quizzes stored in Supabase
- Knowledge checks at milestone completion
- Score tracking and history
- Difficulty levels (1-5 scale)

### 2.3 Adaptive Roadmap
- Perplexity re-generates recommendations based on:
  - Assessment performance
  - Pace of progress
  - Changed circumstances
  - User feedback
  - Updated job market data (real-time search)

**Deliverable:** Users learn through curated resources and validate progress through assessments.

---

## Phase 3: Credentialing & Verification

### 3.1 Achievement System
- Digital badges for milestone completion
- Certificates generated as images/PDFs (client-side generation)
- Skill endorsements
- Portfolio of completed work

### 3.2 Verifiable Credentials
- Unique verification URLs (e.g., `careerguide.com/verify/abc123`)
- Credential data stored in Supabase with verification hashes
- Shareable links for LinkedIn/resume
- QR codes for physical sharing

### 3.3 Public Profile
- Optional public profile page
- Displays verified skills and achievements
- Shareable URL

**Deliverable:** Users earn verifiable credentials shareable with employers.

---

## Phase 4: Partnership Ecosystem

### 4.1 Expert Content Portal
- Separate authenticated section for industry experts
- Contribute career path content
- Create assessments
- Endorse user achievements

### 4.2 Employer View
- Search public profiles by skill/career track
- View verified credentials
- Contact candidates (via email or form)

### 4.3 Training Provider Links
- Affiliate links to training providers
- Track referrals for potential revenue

**Deliverable:** Two-sided platform connecting verified learners with employers and experts.

---

## Phase 5: Scale & Enhancement

### 5.1 Career Intelligence
- Static career data updated periodically
- Salary information by career path
- Job market trends (manually curated or API integration)

### 5.2 Community Features
- Discussion forums (could use Supabase real-time or external like Discord)
- Success stories section
- Peer connections

### 5.3 Advanced AI Features
- Interview preparation prompts
- Resume suggestions based on achievements
- Cover letter assistance

**Deliverable:** Full-featured career platform with community features.

---

## Database Schema (Supabase)

```sql
-- Users (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT,
  current_job TEXT,
  education_level TEXT,
  income_bracket TEXT,
  available_hours INTEGER,
  learning_style TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Career Paths (reference data)
CREATE TABLE career_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  typical_timeline_months INTEGER,
  required_skills JSONB,
  salary_range JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Roadmaps
CREATE TABLE roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  career_path_id UUID REFERENCES career_paths,
  target_career TEXT NOT NULL,
  target_date DATE,
  ai_generated_plan JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Milestones
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID REFERENCES roadmaps NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed
  due_date DATE,
  completed_at TIMESTAMP,
  resources JSONB
);

-- Assessments
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID REFERENCES milestones,
  title TEXT NOT NULL,
  questions JSONB,
  passing_score INTEGER DEFAULT 70
);

-- Assessment Results
CREATE TABLE assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  assessment_id UUID REFERENCES assessments NOT NULL,
  score INTEGER,
  passed BOOLEAN,
  completed_at TIMESTAMP DEFAULT NOW()
);

-- Credentials
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  verification_code TEXT UNIQUE,
  issued_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);
```

---

## GitHub Pages Deployment

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### Vite Configuration for GitHub Pages

```javascript
// vite.config.ts
export default defineConfig({
  base: '/CareerGuide/', // Repository name for GitHub Pages
  plugins: [react()],
  build: {
    outDir: 'dist'
  }
})
```

---

## Project Structure

```
CareerGuide/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment
├── public/
│   └── _redirects              # SPA routing for GitHub Pages
├── src/
│   ├── components/
│   │   ├── auth/               # Login, signup components
│   │   ├── dashboard/          # Dashboard components
│   │   ├── onboarding/         # Intake wizard steps
│   │   ├── roadmap/            # Roadmap display components
│   │   └── ui/                 # Shared UI components
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   └── api.ts              # API helpers
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── Onboarding.tsx
│   │   ├── Dashboard.tsx
│   │   └── Roadmap.tsx
│   ├── hooks/                  # Custom React hooks
│   ├── types/                  # TypeScript types
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   └── functions/
│       └── generate-roadmap/   # Edge function for Perplexity API
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## MVP Development Steps

### Step 1: Project Initialization
- Create Vite + React + TypeScript project
- Install dependencies (react-router, @supabase/supabase-js, tailwindcss)
- Configure Tailwind CSS
- Set up GitHub Actions for deployment
- Test deployment to GitHub Pages

### Step 2: Supabase Setup
- Create Supabase project
- Set up authentication providers (Google, GitHub, Email)
- Create database tables
- Configure Row Level Security (RLS) policies
- Create Edge Function for AI API proxy

### Step 3: Authentication Flow
- Build login/signup pages
- Integrate Supabase Auth
- Protected route wrapper
- User session management

### Step 4: Onboarding Wizard
- Multi-step form component
- Form validation
- Save to Supabase on completion
- Progress indicator

### Step 5: AI Roadmap Generation
- Edge Function to call Perplexity API (sonar-pro model)
- Prompt engineering for consistent, research-backed output
- Parse roadmap with citations from response
- Store roadmap and sources in database
- Display roadmap on dashboard with linked resources

### Step 6: Dashboard & Progress Tracking
- Roadmap visualization
- Milestone status updates
- Progress charts
- Profile editing

### Step 7: Polish & Launch
- Mobile responsiveness
- Error handling
- Loading states
- Documentation
- Beta testing

---

## Environment Variables

### Frontend (in GitHub Secrets for Actions)
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc... (public anon key, safe for frontend)
```

### Supabase Edge Functions (in Supabase dashboard)
```
PERPLEXITY_API_KEY=pplx-... (secret, never exposed to frontend)
```

---

## Cost Estimate (MVP)

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| GitHub Pages | Free | $0 |
| Supabase | Free | $0 |
| Perplexity API | Pay-per-use | ~$0.50/user/month |
| Custom Domain (optional) | Annual | ~$12/year |

### Perplexity API Cost Breakdown
- **Per roadmap call:** ~$0.05 (input + output tokens + search)
- **Per user/month:** ~$0.50 (8 calls avg: initial + refinements + updates)
- **100 users:** ~$50/month
- **1,000 users:** ~$500/month

**Total MVP cost: ~$5-50/month** (scales with user count)

---

## Limitations of GitHub Pages Approach

| Limitation | Mitigation |
|------------|------------|
| No server-side rendering | Use client-side rendering; good for SPAs |
| API keys can't be in frontend | Use Supabase Edge Functions as proxy |
| No backend logic | Supabase handles auth, database, and edge functions |
| 100GB/month bandwidth | Sufficient for MVP; upgrade hosting later if needed |
| Static files only | Perfect for React SPA architecture |

---

## Future Migration Path

If CareerGuide outgrows GitHub Pages:
1. **Vercel/Netlify**: Easy migration, same codebase, adds edge functions
2. **Full backend**: Add Node.js/Python API, keep Supabase for database
3. **Custom infrastructure**: AWS/GCP when scale demands it

The React frontend and Supabase backend remain unchanged in any migration.

---

## Next Steps

1. Initialize Vite + React project in repository
2. Create Supabase project and configure auth
3. Set up GitHub Actions deployment workflow
4. Build authentication pages
5. Create onboarding wizard
6. Implement Perplexity API integration via Supabase Edge Function

---

## Perplexity API Integration Example

### Edge Function (`supabase/functions/generate-roadmap/index.ts`)

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')

serve(async (req) => {
  const { userProfile, targetCareer, timeframe } = await req.json()

  const systemPrompt = `You are a career guidance expert. Generate a detailed,
actionable career roadmap. Include specific courses, certifications, and
milestones with realistic timelines. Cite sources for all recommendations.`

  const userPrompt = `
Create a career transition roadmap for:
- Current role: ${userProfile.currentJob}
- Experience: ${userProfile.yearsExperience} years
- Education: ${userProfile.education}
- Available hours/week: ${userProfile.availableHours}
- Learning style: ${userProfile.learningStyle}
- Target career: ${targetCareer}
- Desired timeframe: ${timeframe}

Search for current job market requirements, recommended training programs,
salary expectations, and create a milestone-based plan.`

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      return_citations: true,
      search_recency_filter: 'month'
    }),
  })

  const data = await response.json()

  return new Response(JSON.stringify({
    roadmap: data.choices[0].message.content,
    citations: data.citations
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

This Edge Function:
- Receives user profile data from the frontend
- Constructs a research-focused prompt
- Calls Perplexity API with `sonar-pro` model
- Returns the roadmap with source citations
- Keeps the API key secure (never exposed to browser)
