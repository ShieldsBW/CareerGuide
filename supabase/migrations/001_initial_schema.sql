-- CareerGuide Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  current_job TEXT,
  years_experience INTEGER DEFAULT 0,
  education_level TEXT,
  income_bracket TEXT,
  available_hours INTEGER DEFAULT 10,
  learning_style TEXT DEFAULT 'mixed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Career Paths (reference data)
CREATE TABLE IF NOT EXISTS career_paths (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  typical_timeline_months INTEGER,
  required_skills JSONB DEFAULT '[]',
  salary_range JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Roadmaps
CREATE TABLE IF NOT EXISTS roadmaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  career_path_id UUID REFERENCES career_paths,
  target_career TEXT NOT NULL,
  target_date DATE,
  ai_generated_plan JSONB DEFAULT '{}',
  citations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Milestones
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roadmap_id UUID REFERENCES roadmaps ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  resources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assessments
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  milestone_id UUID REFERENCES milestones ON DELETE CASCADE,
  career_path_id UUID REFERENCES career_paths,
  title TEXT NOT NULL,
  questions JSONB DEFAULT '[]',
  passing_score INTEGER DEFAULT 70,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assessment Results
CREATE TABLE IF NOT EXISTS assessment_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  assessment_id UUID REFERENCES assessments ON DELETE CASCADE NOT NULL,
  score INTEGER,
  passed BOOLEAN DEFAULT FALSE,
  answers JSONB DEFAULT '{}',
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credentials
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  verification_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Enable Row Level Security on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data

-- User Profiles policies
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Roadmaps policies
CREATE POLICY "Users can view own roadmaps" ON roadmaps
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own roadmaps" ON roadmaps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own roadmaps" ON roadmaps
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own roadmaps" ON roadmaps
  FOR DELETE USING (auth.uid() = user_id);

-- Milestones policies (access via roadmap ownership)
CREATE POLICY "Users can view milestones of own roadmaps" ON milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM roadmaps
      WHERE roadmaps.id = milestones.roadmap_id
      AND roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create milestones for own roadmaps" ON milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM roadmaps
      WHERE roadmaps.id = milestones.roadmap_id
      AND roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update milestones of own roadmaps" ON milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM roadmaps
      WHERE roadmaps.id = milestones.roadmap_id
      AND roadmaps.user_id = auth.uid()
    )
  );

-- Assessment Results policies
CREATE POLICY "Users can view own assessment results" ON assessment_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own assessment results" ON assessment_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Credentials policies
CREATE POLICY "Users can view own credentials" ON credentials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can verify credentials by code" ON credentials
  FOR SELECT USING (verification_code IS NOT NULL);

-- Career paths are public (read-only for users)
ALTER TABLE career_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Career paths are viewable by everyone" ON career_paths
  FOR SELECT USING (true);

-- Assessments are public (read-only for users)
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assessments are viewable by everyone" ON assessments
  FOR SELECT USING (true);

-- Function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add some sample career paths
INSERT INTO career_paths (name, description, typical_timeline_months, required_skills, salary_range) VALUES
  ('Software Engineer', 'Build and maintain software applications', 12, '["Programming", "Problem Solving", "Version Control", "Testing"]', '{"min": 70000, "max": 150000}'),
  ('Data Scientist', 'Analyze data and build machine learning models', 18, '["Python", "Statistics", "Machine Learning", "SQL"]', '{"min": 80000, "max": 160000}'),
  ('UX Designer', 'Design user experiences for digital products', 9, '["User Research", "Wireframing", "Prototyping", "Visual Design"]', '{"min": 60000, "max": 120000}'),
  ('Product Manager', 'Lead product development and strategy', 12, '["Communication", "Analytics", "Strategy", "Leadership"]', '{"min": 90000, "max": 180000}'),
  ('Cybersecurity Analyst', 'Protect systems from security threats', 12, '["Network Security", "Risk Assessment", "Incident Response", "Compliance"]', '{"min": 75000, "max": 140000}')
ON CONFLICT DO NOTHING;
