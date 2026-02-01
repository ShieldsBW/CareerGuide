-- CareerGuide Enhancement: Subtasks, Skills Tracking, and API Usage
-- Migration 002

-- ============================================
-- SUBTASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID REFERENCES milestones ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Access subtasks via parent milestone ownership
CREATE POLICY "Users can view subtasks of own milestones" ON subtasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN roadmaps r ON r.id = m.roadmap_id
      WHERE m.id = subtasks.milestone_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create subtasks for own milestones" ON subtasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN roadmaps r ON r.id = m.roadmap_id
      WHERE m.id = subtasks.milestone_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update subtasks of own milestones" ON subtasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN roadmaps r ON r.id = m.roadmap_id
      WHERE m.id = subtasks.milestone_id
      AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete subtasks of own milestones" ON subtasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN roadmaps r ON r.id = m.roadmap_id
      WHERE m.id = subtasks.milestone_id
      AND r.user_id = auth.uid()
    )
  );

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subtasks_milestone_id ON subtasks(milestone_id);

-- ============================================
-- USER SKILLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  skill_name TEXT NOT NULL,
  proficiency_level INTEGER CHECK (proficiency_level BETWEEN 1 AND 5) DEFAULT 1,
  source TEXT DEFAULT 'manual', -- 'manual', 'assessment', 'linkedin'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_name)
);

-- Enable RLS
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own skills" ON user_skills
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own skills" ON user_skills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skills" ON user_skills
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own skills" ON user_skills
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);

-- ============================================
-- TARGET ROLE SKILLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS target_role_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID REFERENCES roadmaps ON DELETE CASCADE NOT NULL,
  skill_name TEXT NOT NULL,
  required_level INTEGER CHECK (required_level BETWEEN 1 AND 5) DEFAULT 3,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(roadmap_id, skill_name)
);

-- Enable RLS
ALTER TABLE target_role_skills ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Access via roadmap ownership
CREATE POLICY "Users can view target skills of own roadmaps" ON target_role_skills
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM roadmaps
      WHERE roadmaps.id = target_role_skills.roadmap_id
      AND roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create target skills for own roadmaps" ON target_role_skills
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM roadmaps
      WHERE roadmaps.id = target_role_skills.roadmap_id
      AND roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update target skills of own roadmaps" ON target_role_skills
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM roadmaps
      WHERE roadmaps.id = target_role_skills.roadmap_id
      AND roadmaps.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete target skills of own roadmaps" ON target_role_skills
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM roadmaps
      WHERE roadmaps.id = target_role_skills.roadmap_id
      AND roadmaps.user_id = auth.uid()
    )
  );

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_target_role_skills_roadmap_id ON target_role_skills(roadmap_id);

-- ============================================
-- SKILL GAP ANALYSIS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS skill_gap_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID REFERENCES roadmaps ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  overall_readiness INTEGER CHECK (overall_readiness BETWEEN 0 AND 100) DEFAULT 0,
  critical_gaps JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  milestone_skill_mapping JSONB DEFAULT '{}',
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE skill_gap_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own skill gap analysis" ON skill_gap_analysis
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own skill gap analysis" ON skill_gap_analysis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skill gap analysis" ON skill_gap_analysis
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own skill gap analysis" ON skill_gap_analysis
  FOR DELETE USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_skill_gap_analysis_roadmap_id ON skill_gap_analysis(roadmap_id);
CREATE INDEX IF NOT EXISTS idx_skill_gap_analysis_user_id ON skill_gap_analysis(user_id);

-- ============================================
-- API USAGE TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  operation TEXT NOT NULL, -- 'generate_roadmap', 'generate_subtasks', 'analyze_gaps'
  credits_used INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own API usage" ON api_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own API usage records" ON api_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups and aggregations
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_operation ON api_usage(operation);

-- ============================================
-- HELPER FUNCTION: Get monthly API usage
-- ============================================
CREATE OR REPLACE FUNCTION get_monthly_api_usage(target_user_id UUID)
RETURNS TABLE (
  operation TEXT,
  total_credits BIGINT,
  usage_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.operation,
    COALESCE(SUM(au.credits_used), 0) as total_credits,
    COUNT(*) as usage_count
  FROM api_usage au
  WHERE au.user_id = target_user_id
    AND au.created_at >= date_trunc('month', CURRENT_DATE)
  GROUP BY au.operation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Calculate skill readiness
-- ============================================
CREATE OR REPLACE FUNCTION calculate_skill_readiness(target_roadmap_id UUID, target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_required_points INTEGER := 0;
  achieved_points INTEGER := 0;
  readiness INTEGER := 0;
BEGIN
  -- Get total required skill points
  SELECT COALESCE(SUM(required_level), 0) INTO total_required_points
  FROM target_role_skills
  WHERE roadmap_id = target_roadmap_id;

  -- Get achieved skill points (capped at required level)
  SELECT COALESCE(SUM(LEAST(us.proficiency_level, trs.required_level)), 0) INTO achieved_points
  FROM target_role_skills trs
  LEFT JOIN user_skills us ON LOWER(us.skill_name) = LOWER(trs.skill_name) AND us.user_id = target_user_id
  WHERE trs.roadmap_id = target_roadmap_id;

  -- Calculate readiness percentage
  IF total_required_points > 0 THEN
    readiness := ROUND((achieved_points::DECIMAL / total_required_points) * 100);
  END IF;

  RETURN readiness;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
