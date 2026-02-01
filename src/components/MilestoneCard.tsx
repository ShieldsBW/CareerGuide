import { useState } from 'react';
import { Button, Card } from './ui';
import type { Milestone, Subtask } from '../types';
import { supabase } from '../lib/supabase';

interface MilestoneCardProps {
  milestone: Milestone;
  index: number;
  onStatusChange: (milestoneId: string, status: Milestone['status']) => void;
  onSubtaskToggle: (subtaskId: string, isCompleted: boolean) => void;
  onGenerateSubtasks?: (milestoneId: string) => void;
  isGeneratingSubtasks?: boolean;
}

export function MilestoneCard({
  milestone,
  index,
  onStatusChange,
  onSubtaskToggle,
  onGenerateSubtasks,
  isGeneratingSubtasks,
}: MilestoneCardProps) {
  const [isExpanded, setIsExpanded] = useState(milestone.status === 'in_progress');

  const subtasks = milestone.subtasks || [];
  const completedSubtasks = subtasks.filter((s) => s.isCompleted).length;
  const totalSubtasks = subtasks.length;
  const subtaskProgress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

  const getStatusColor = (status: Milestone['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getStepColor = (status: Milestone['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500 text-white';
      case 'in_progress':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    }
  };

  const handleSubtaskCheck = async (subtask: Subtask) => {
    const newIsCompleted = !subtask.isCompleted;
    onSubtaskToggle(subtask.id, newIsCompleted);

    // Update in database
    await supabase
      .from('subtasks')
      .update({
        is_completed: newIsCompleted,
        completed_at: newIsCompleted ? new Date().toISOString() : null,
      })
      .eq('id', subtask.id);
  };

  return (
    <Card variant="bordered" className="!p-0">
      {/* Collapsed Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <div className="flex items-center gap-3 px-3 py-2">
          {/* Step Number */}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${getStepColor(
              milestone.status
            )}`}
          >
            {milestone.status === 'completed' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              index + 1
            )}
          </div>

          {/* Title and Progress */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
              {milestone.title}
            </h3>
            {totalSubtasks > 0 && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 max-w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    className="bg-indigo-600 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${subtaskProgress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {completedSubtasks}/{totalSubtasks}
                </span>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 whitespace-nowrap ${getStatusColor(
              milestone.status
            )}`}
          >
            {milestone.status.replace('_', ' ')}
          </span>

          {/* Expand/Collapse Arrow */}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isExpanded ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{milestone.description}</p>

          {/* Subtasks Checklist */}
          {totalSubtasks > 0 ? (
            <div className="mb-3">
              <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Tasks
              </h4>
              <ul className="space-y-1.5">
                {subtasks
                  .sort((a, b) => a.orderIndex - b.orderIndex)
                  .map((subtask) => (
                    <li key={subtask.id} className="flex items-start gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSubtaskCheck(subtask);
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                          subtask.isCompleted
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                        }`}
                      >
                        {subtask.isCompleted && (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </button>
                      <div className="flex-1">
                        <span
                          className={`text-sm ${
                            subtask.isCompleted
                              ? 'text-gray-400 line-through'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {subtask.title}
                        </span>
                        {subtask.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                            {subtask.description}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ) : onGenerateSubtasks ? (
            <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                No tasks yet. Generate AI-powered tasks to break down this milestone.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerateSubtasks(milestone.id);
                }}
                isLoading={isGeneratingSubtasks}
                disabled={isGeneratingSubtasks}
              >
                {isGeneratingSubtasks ? 'Generating...' : 'Generate Tasks (1 credit)'}
              </Button>
            </div>
          ) : null}

          {/* Resources */}
          {milestone.resources && milestone.resources.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Resources
              </h4>
              <ul className="space-y-0.5">
                {milestone.resources.map((resource, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                      {resource.type}
                    </span>
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-indigo-600 hover:text-indigo-500 text-xs"
                    >
                      {resource.title}
                    </a>
                    {resource.estimatedHours && (
                      <span className="text-xs text-gray-500">
                        ~{resource.estimatedHours}h
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {milestone.status === 'pending' && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(milestone.id, 'in_progress');
                }}
              >
                Start
              </Button>
            )}
            {milestone.status === 'in_progress' && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(milestone.id, 'completed');
                }}
              >
                Mark Complete
              </Button>
            )}
            {milestone.status === 'completed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(milestone.id, 'in_progress');
                }}
              >
                Reopen
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
