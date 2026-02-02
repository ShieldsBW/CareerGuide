import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui';
import { supabase } from '../lib/supabase';
import { estimateTaskDurations } from '../lib/api';
import type { TaskForEstimation, TaskDurationEstimate } from '../lib/api';

interface DailyGoal {
  id: string;
  title: string;
  duration: 'short' | 'medium' | 'long';
  durationLabel: string;
  durationMinutes?: number;
  milestoneTitle: string;
  roadmapId: string;
  type: 'subtask' | 'milestone';
}

interface DailyGoalsProps {
  userId: string;
}

// Cache key for localStorage
const DURATION_CACHE_KEY = 'dailyGoals_durationCache';
const CACHE_EXPIRY_HOURS = 24;

interface CachedEstimates {
  estimates: Record<string, TaskDurationEstimate>;
  timestamp: number;
}

export function DailyGoals({ userId }: DailyGoalsProps) {
  const [goals, setGoals] = useState<DailyGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDailyGoals();
  }, [userId]);

  // Get cached estimates from localStorage
  const getCachedEstimates = (): Record<string, TaskDurationEstimate> => {
    try {
      const cached = localStorage.getItem(DURATION_CACHE_KEY);
      if (!cached) return {};

      const parsed: CachedEstimates = JSON.parse(cached);
      const now = Date.now();
      const expiryMs = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;

      // Check if cache is expired
      if (now - parsed.timestamp > expiryMs) {
        localStorage.removeItem(DURATION_CACHE_KEY);
        return {};
      }

      return parsed.estimates;
    } catch {
      return {};
    }
  };

  // Save estimates to localStorage cache
  const saveToCachedEstimates = (newEstimates: TaskDurationEstimate[]) => {
    try {
      const existing = getCachedEstimates();
      const updated: Record<string, TaskDurationEstimate> = { ...existing };

      for (const est of newEstimates) {
        updated[est.id] = est;
      }

      const cacheData: CachedEstimates = {
        estimates: updated,
        timestamp: Date.now(),
      };

      localStorage.setItem(DURATION_CACHE_KEY, JSON.stringify(cacheData));
    } catch {
      // Ignore storage errors
    }
  };

  const loadDailyGoals = async () => {
    try {
      // Get user's roadmaps
      const { data: roadmaps } = await supabase
        .from('roadmaps')
        .select('id, target_career')
        .eq('user_id', userId);

      if (!roadmaps || roadmaps.length === 0) {
        setIsLoading(false);
        return;
      }

      const roadmapIds = roadmaps.map(r => r.id);
      const targetCareer = roadmaps[0]?.target_career || 'professional';

      // Get incomplete milestones
      const { data: milestones } = await supabase
        .from('milestones')
        .select('id, title, roadmap_id, status, order_index')
        .in('roadmap_id', roadmapIds)
        .neq('status', 'completed')
        .order('order_index');

      if (!milestones || milestones.length === 0) {
        setIsLoading(false);
        return;
      }

      const milestoneIds = milestones.map(m => m.id);

      // Get incomplete subtasks
      const { data: subtasks } = await supabase
        .from('subtasks')
        .select('id, title, milestone_id, is_completed, order_index')
        .in('milestone_id', milestoneIds)
        .eq('is_completed', false)
        .order('order_index');

      // Create a map of milestone info
      const milestoneMap = new Map(milestones.map(m => [m.id, m]));

      // Collect tasks for duration estimation
      const tasksForEstimation: TaskForEstimation[] = [];

      if (subtasks) {
        for (const subtask of subtasks.slice(0, 10)) { // Limit to 10 for API efficiency
          const milestone = milestoneMap.get(subtask.milestone_id);
          if (!milestone) continue;

          tasksForEstimation.push({
            id: subtask.id,
            title: subtask.title,
            milestoneTitle: milestone.title,
          });
        }
      }

      // Get cached estimates and identify which tasks need AI estimation
      const cachedEstimates = getCachedEstimates();
      const uncachedTasks = tasksForEstimation.filter(t => !cachedEstimates[t.id]);

      // Get AI estimates for uncached tasks
      let newEstimates: TaskDurationEstimate[] = [];
      if (uncachedTasks.length > 0) {
        const result = await estimateTaskDurations(uncachedTasks, targetCareer);
        if (!result.error && result.estimates.length > 0) {
          newEstimates = result.estimates;
          saveToCachedEstimates(newEstimates);
        }
      }

      // Combine cached and new estimates
      const allEstimates: Record<string, TaskDurationEstimate> = {
        ...cachedEstimates,
        ...Object.fromEntries(newEstimates.map(e => [e.id, e])),
      };

      // Generate daily goals from subtasks with AI-estimated durations
      const dailyGoals: DailyGoal[] = [];
      const usedMilestones = new Set<string>();

      if (subtasks) {
        for (const subtask of subtasks) {
          const milestone = milestoneMap.get(subtask.milestone_id);
          if (!milestone) continue;

          // Use AI estimate if available, otherwise use keyword fallback
          const estimate = allEstimates[subtask.id];
          const duration = estimate?.duration || fallbackEstimateDuration(subtask.title);
          const minutes = estimate?.minutes;

          dailyGoals.push({
            id: subtask.id,
            title: subtask.title,
            duration,
            durationLabel: getDurationLabel(duration, minutes),
            durationMinutes: minutes,
            milestoneTitle: milestone.title,
            roadmapId: milestone.roadmap_id,
            type: 'subtask',
          });

          usedMilestones.add(milestone.id);
        }
      }

      // If we don't have enough subtasks, add milestone-level goals
      if (dailyGoals.length < 3) {
        for (const milestone of milestones) {
          if (usedMilestones.has(milestone.id)) continue;

          dailyGoals.push({
            id: milestone.id,
            title: `Work on: ${milestone.title}`,
            duration: 'long',
            durationLabel: '~2 hours',
            durationMinutes: 120,
            milestoneTitle: milestone.title,
            roadmapId: milestone.roadmap_id,
            type: 'milestone',
          });

          if (dailyGoals.length >= 6) break;
        }
      }

      // Sort by duration and pick one of each type
      const shortGoals = dailyGoals.filter(g => g.duration === 'short');
      const mediumGoals = dailyGoals.filter(g => g.duration === 'medium');
      const longGoals = dailyGoals.filter(g => g.duration === 'long');

      const selectedGoals: DailyGoal[] = [];
      if (shortGoals.length > 0) selectedGoals.push(shortGoals[0]);
      if (mediumGoals.length > 0) selectedGoals.push(mediumGoals[0]);
      if (longGoals.length > 0) selectedGoals.push(longGoals[0]);

      // If we still need goals, fill from remaining
      if (selectedGoals.length < 3) {
        const remaining = dailyGoals.filter(g => !selectedGoals.includes(g));
        for (const goal of remaining) {
          if (selectedGoals.length >= 3) break;
          selectedGoals.push(goal);
        }
      }

      setGoals(selectedGoals);
    } catch (error) {
      console.error('Error loading daily goals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fallback keyword-based estimation if AI fails
  const fallbackEstimateDuration = (title: string): 'short' | 'medium' | 'long' => {
    const lowerTitle = title.toLowerCase();

    const shortKeywords = ['review', 'read', 'watch', 'check', 'list', 'outline', 'draft', 'note', 'bookmark', 'sign up', 'register', 'subscribe'];
    if (shortKeywords.some(k => lowerTitle.includes(k))) {
      return 'short';
    }

    const longKeywords = ['build', 'create', 'implement', 'develop', 'complete', 'finish', 'course', 'project', 'deploy', 'design', 'write'];
    if (longKeywords.some(k => lowerTitle.includes(k))) {
      return 'long';
    }

    return 'medium';
  };

  const getDurationLabel = (duration: 'short' | 'medium' | 'long', minutes?: number): string => {
    if (minutes) {
      if (minutes < 60) {
        return `~${minutes} min`;
      } else {
        const hours = Math.round(minutes / 30) / 2; // Round to nearest 0.5
        return hours === 1 ? '~1 hour' : `~${hours} hours`;
      }
    }
    // Fallback labels
    switch (duration) {
      case 'short': return '~30 min';
      case 'medium': return '~1 hour';
      case 'long': return '~2 hours';
    }
  };

  const getDurationColor = (duration: 'short' | 'medium' | 'long'): string => {
    switch (duration) {
      case 'short': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'long': return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
    }
  };

  const handleMarkComplete = async (goal: DailyGoal) => {
    try {
      if (goal.type === 'subtask') {
        await supabase
          .from('subtasks')
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq('id', goal.id);
      }

      setCompletedToday(prev => new Set([...prev, goal.id]));
    } catch (error) {
      console.error('Error marking goal complete:', error);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (goals.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Today's Goals
          </h3>
          <span className="text-xs text-gray-500">
            {completedToday.size}/{goals.length} done
          </span>
        </div>

        <div className="space-y-2">
          {goals.map((goal) => {
            const isCompleted = completedToday.has(goal.id);

            return (
              <div
                key={goal.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isCompleted
                    ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => handleMarkComplete(goal)}
                  disabled={isCompleted}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isCompleted
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 dark:border-gray-600 active:border-indigo-500'
                  }`}
                >
                  {isCompleted && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                    {goal.title}
                  </p>
                  <Link
                    to={`/roadmap/${goal.roadmapId}`}
                    className="text-xs text-gray-500 hover:text-indigo-600 truncate block"
                  >
                    {goal.milestoneTitle}
                  </Link>
                </div>

                {/* Duration Badge */}
                <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${getDurationColor(goal.duration)}`}>
                  {goal.durationLabel}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Time estimates are personalized for career changers
        </p>
      </CardContent>
    </Card>
  );
}
