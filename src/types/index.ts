// User profile from onboarding
export interface UserProfile {
  id: string;
  fullName: string;
  currentJob: string;
  yearsExperience: number;
  education: string;
  incomeBracket: string;
  availableHours: number;
  learningStyle: 'video' | 'reading' | 'hands-on' | 'mixed';
  createdAt: string;
  updatedAt: string;
}

// Subtask within a milestone
export interface Subtask {
  id: string;
  milestoneId: string;
  title: string;
  description?: string;
  orderIndex: number;
  isCompleted: boolean;
  completedAt?: string;
  createdAt?: string;
}

// User skill profile
export interface UserSkill {
  id: string;
  userId: string;
  skillName: string;
  proficiencyLevel: 0 | 1 | 2 | 3 | 4 | 5; // 0 = needs rating
  source: 'manual' | 'assessment' | 'linkedin' | 'role_requirement';
  createdAt?: string;
  updatedAt?: string;
}

// Target role required skill
export interface TargetRoleSkill {
  id: string;
  roadmapId: string;
  skillName: string;
  requiredLevel: 1 | 2 | 3 | 4 | 5;
  priority: 'critical' | 'high' | 'medium' | 'low';
  createdAt?: string;
}

// Skill gap analysis result
export interface SkillGap {
  skillName: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  recommendations?: string[];
  matchedUserSkill?: string; // User skill that matched this requirement (for fuzzy/transferable matches)
}

// Skill match from fuzzy matching
export interface SkillMatch {
  requiredSkill: string;
  userSkill: string;
  matchType: 'exact' | 'similar' | 'transferable';
  confidence: number;
}

// Full skill gap analysis
export interface SkillGapAnalysis {
  id: string;
  roadmapId: string;
  userId: string;
  overallReadiness: number;
  criticalGaps: SkillGap[];
  recommendations: string[];
  milestoneSkillMapping: Record<string, unknown>; // Can include skillMatches: SkillMatch[]
  analyzedAt: string;
}

// API usage tracking
export interface ApiUsage {
  id: string;
  userId: string;
  operation: 'generate_roadmap' | 'generate_subtasks' | 'analyze_gaps';
  creditsUsed: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// API usage summary for display
export interface ApiUsageSummary {
  operation: string;
  totalCredits: number;
  usageCount: number;
}

// Proficiency level labels
export const PROFICIENCY_LABELS: Record<number, string> = {
  0: 'Needs rating',
  1: 'Beginner',
  2: 'Elementary',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
};

// Career roadmap
export interface Roadmap {
  id: string;
  userId: string;
  targetCareer: string;
  targetDate: string;
  milestones: Milestone[];
  citations: Citation[];
  createdAt: string;
  updatedAt: string;
}

// Milestone within a roadmap
export interface Milestone {
  id: string;
  title: string;
  description: string;
  orderIndex: number;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate?: string;
  completedAt?: string;
  resources: Resource[];
  subtasks?: Subtask[];
}

// Learning resource
export interface Resource {
  title: string;
  url: string;
  type: 'course' | 'book' | 'video' | 'article' | 'certification';
  provider?: string;
  estimatedHours?: number;
}

// Citation from Perplexity API
export interface Citation {
  url: string;
  title: string;
}

// Onboarding form data
export interface OnboardingData {
  // Step 1: Current situation
  currentJob: string;
  yearsExperience: number;
  education: string[]; // Multiple selections allowed

  // Step 2: Resources
  incomeBracket: string;
  monthlySavings: string;
  availableHours: number;

  // Step 3: Learning preferences
  learningStyle: 'video' | 'reading' | 'hands-on' | 'mixed';

  // Step 4: Goals
  targetCareer: string;
  targetTimeframe: string;
}
