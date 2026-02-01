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
