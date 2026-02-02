import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui';
import { supabase } from '../lib/supabase';
import { generateDailyGoals } from '../lib/api';
import type { TaskForGoals, DailyGoalFromAI } from '../lib/api';

interface DailyGoal {
  id: string;
  sourceTaskId: string;
  title: string;
  duration: 'short' | 'medium' | 'long';
  durationLabel: string;
  milestoneTitle: string;
  roadmapId: string;
  isPartialTask: boolean;
}

interface DailyGoalsProps {
  userId: string;
}

// Cache key for localStorage
const GOALS_CACHE_KEY = 'dailyGoals_cache';

interface CachedGoals {
  goals: DailyGoal[];
  date: string; // YYYY-MM-DD format
}

export function DailyGoals({ userId }: DailyGoalsProps) {
  const [goals, setGoals] = useState<DailyGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completedToday, setCompletedToday] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDailyGoals();
  }, [userId]);

  // Get today's date as YYYY-MM-DD
  const getTodayDate = (): string => {
    return new Date().toISOString().split('T')[0];
  };

  // Get cached goals if they're from today
  const getCachedGoals = (): DailyGoal[] | null => {
    try {
      const cached = localStorage.getItem(GOALS_CACHE_KEY);
      if (!cached) return null;

      const parsed: CachedGoals = JSON.parse(cached);
      if (parsed.date === getTodayDate()) {
        return parsed.goals;
      }

      // Cache is stale, remove it
      localStorage.removeItem(GOALS_CACHE_KEY);
      return null;
    } catch {
      return null;
    }
  };

  // Save goals to cache
  const saveGoalsToCache = (goalsToCache: DailyGoal[]) => {
    try {
      const cacheData: CachedGoals = {
        goals: goalsToCache,
        date: getTodayDate(),
      };
      localStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(cacheData));
    } catch {
      // Ignore storage errors
    }
  };

  const loadDailyGoals = async () => {
    try {
      // Check cache first
      const cachedGoals = getCachedGoals();
      if (cachedGoals && cachedGoals.length > 0) {
        setGoals(cachedGoals);
        setIsLoading(false);
        return;
      }

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

      // Get incomplete milestones in order
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
      const milestoneMap = new Map(milestones.map(m => [m.id, m]));

      // Get incomplete subtasks in order
      const { data: subtasks } = await supabase
        .from('subtasks')
        .select('id, title, milestone_id, is_completed, order_index')
        .in('milestone_id', milestoneIds)
        .eq('is_completed', false)
        .order('order_index');

      if (!subtasks || subtasks.length === 0) {
        setIsLoading(false);
        return;
      }

      // Build task list for AI - prioritized by milestone order, then subtask order
      const tasksForAI: TaskForGoals[] = [];
      for (const milestone of milestones) {
        const milestoneSubtasks = subtasks.filter(s => s.milestone_id === milestone.id);
        for (const subtask of milestoneSubtasks) {
          tasksForAI.push({
            id: subtask.id,
            title: subtask.title,
            milestoneTitle: milestone.title,
          });
        }
      }

      // Limit to first 10 tasks for API efficiency
      const limitedTasks = tasksForAI.slice(0, 10);

      // Get AI-generated goals
      const result = await generateDailyGoals(limitedTasks, targetCareer);

      if (result.error || result.goals.length === 0) {
        // Fallback: create simple goals from first 3 tasks
        const fallbackGoals = createFallbackGoals(limitedTasks, milestoneMap, roadmaps[0].id);
        setGoals(fallbackGoals);
        saveGoalsToCache(fallbackGoals);
        setIsLoading(false);
        return;
      }

      // Convert AI goals to DailyGoal format
      const dailyGoals: DailyGoal[] = result.goals.map((aiGoal: DailyGoalFromAI) => {
        const task = tasksForAI.find(t => t.id === aiGoal.sourceTaskId);
        const subtask = subtasks.find(s => s.id === aiGoal.sourceTaskId);
        const milestone = subtask ? milestoneMap.get(subtask.milestone_id) : null;

        return {
          id: `${aiGoal.sourceTaskId}-${aiGoal.duration}`,
          sourceTaskId: aiGoal.sourceTaskId,
          title: aiGoal.dailyTitle,
          duration: aiGoal.duration,
          durationLabel: getDurationLabel(aiGoal.minutes),
          milestoneTitle: task?.milestoneTitle || milestone?.title || 'Milestone',
          roadmapId: milestone?.roadmap_id || roadmaps[0].id,
          isPartialTask: aiGoal.isPartialTask,
        };
      });

      // Sort by duration: short, medium, long
      const sortOrder = { short: 0, medium: 1, long: 2 };
      dailyGoals.sort((a, b) => sortOrder[a.duration] - sortOrder[b.duration]);

      setGoals(dailyGoals);
      saveGoalsToCache(dailyGoals);
    } catch (error) {
      console.error('Error loading daily goals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create fallback goals if AI fails
  const createFallbackGoals = (
    tasks: TaskForGoals[],
    _milestoneMap: Map<string, unknown>,
    defaultRoadmapId: string
  ): DailyGoal[] => {
    const durations: Array<{ duration: 'short' | 'medium' | 'long'; minutes: number }> = [
      { duration: 'short', minutes: 30 },
      { duration: 'medium', minutes: 60 },
      { duration: 'long', minutes: 120 },
    ];

    return tasks.slice(0, 3).map((task, idx) => {
      const dur = durations[idx] || durations[0];
      return {
        id: `${task.id}-${dur.duration}`,
        sourceTaskId: task.id,
        title: task.title,
        duration: dur.duration,
        durationLabel: getDurationLabel(dur.minutes),
        milestoneTitle: task.milestoneTitle,
        roadmapId: defaultRoadmapId,
        isPartialTask: false,
      };
    });
  };

  const getDurationLabel = (minutes: number): string => {
    if (minutes <= 45) {
      return `~${minutes} min`;
    } else if (minutes < 90) {
      return '~1 hour';
    } else {
      const hours = Math.round(minutes / 60);
      return `~${hours} hours`;
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
      // Only mark the source subtask as complete if it's NOT a partial task
      if (!goal.isPartialTask) {
        await supabase
          .from('subtasks')
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq('id', goal.sourceTaskId);
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
                      : 'border-gray-300 dark:border-gray-600 hover:border-indigo-500'
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
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/roadmap/${goal.roadmapId}`}
                      className="text-xs text-gray-500 hover:text-indigo-600 truncate"
                    >
                      {goal.milestoneTitle}
                    </Link>
                    {goal.isPartialTask && (
                      <span className="text-xs text-indigo-500 dark:text-indigo-400 flex-shrink-0">
                        (progress)
                      </span>
                    )}
                  </div>
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
          Pick a goal based on how much time you have today
        </p>
      </CardContent>
    </Card>
  );
}
