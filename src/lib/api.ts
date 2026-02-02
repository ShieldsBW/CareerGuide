import { supabase } from './supabase';
import type { OnboardingData, Roadmap } from '../types';

// Generate a career roadmap using Perplexity API via Supabase Edge Function
export async function generateRoadmap(
  userProfile: OnboardingData
): Promise<{ roadmap: Roadmap; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-roadmap', {
      body: {
        userProfile: {
          currentJob: userProfile.currentJob,
          yearsExperience: userProfile.yearsExperience,
          education: userProfile.education,
          availableHours: userProfile.availableHours,
          learningStyle: userProfile.learningStyle,
        },
        targetCareer: userProfile.targetCareer,
        timeframe: userProfile.targetTimeframe,
      },
    });

    if (error) {
      return { roadmap: null as unknown as Roadmap, error: error.message };
    }

    return { roadmap: data.roadmap };
  } catch (err) {
    return {
      roadmap: null as unknown as Roadmap,
      error: err instanceof Error ? err.message : 'Failed to generate roadmap',
    };
  }
}

// Save user profile to database
export async function saveUserProfile(userId: string, profile: OnboardingData) {
  const { error } = await supabase.from('user_profiles').upsert({
    id: userId,
    current_job: profile.currentJob,
    years_experience: profile.yearsExperience,
    education_level: profile.education,
    income_bracket: profile.incomeBracket,
    available_hours: profile.availableHours,
    learning_style: profile.learningStyle,
    updated_at: new Date().toISOString(),
  });

  return { error };
}

// Get user's roadmaps
export async function getUserRoadmaps(userId: string) {
  const { data, error } = await supabase
    .from('roadmaps')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { roadmaps: data, error };
}

// Update milestone status
export async function updateMilestoneStatus(
  milestoneId: string,
  status: 'pending' | 'in_progress' | 'completed'
) {
  const { error } = await supabase
    .from('milestones')
    .update({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', milestoneId);

  return { error };
}

// Generate daily goals using AI
export interface TaskForGoals {
  id: string;
  title: string;
  milestoneTitle: string;
}

export interface DailyGoalFromAI {
  sourceTaskId: string;
  duration: 'short' | 'medium' | 'long';
  minutes: number;
  dailyTitle: string;
  isPartialTask: boolean;
  reasoning: string;
}

export async function generateDailyGoals(
  tasks: TaskForGoals[],
  targetCareer: string
): Promise<{ goals: DailyGoalFromAI[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('estimate-task-durations', {
      body: { tasks, targetCareer },
    });

    if (error) {
      return { goals: [], error: error.message };
    }

    return { goals: data.goals || [] };
  } catch (err) {
    return {
      goals: [],
      error: err instanceof Error ? err.message : 'Failed to generate daily goals',
    };
  }
}
