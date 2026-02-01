import { Card, CardContent } from './ui';
import type { ApiUsageSummary } from '../types';

interface ApiUsageDisplayProps {
  usage: ApiUsageSummary[];
  isLoading?: boolean;
}

const OPERATION_LABELS: Record<string, { label: string; icon: string }> = {
  generate_roadmap: { label: 'Roadmap Generation', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  generate_subtasks: { label: 'Task Generation', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  analyze_gaps: { label: 'Skill Gap Analysis', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
};

export function ApiUsageDisplay({ usage, isLoading }: ApiUsageDisplayProps) {
  const totalCredits = usage.reduce((sum, u) => sum + u.totalCredits, 0);
  const totalOperations = usage.reduce((sum, u) => sum + u.usageCount, 0);

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            API Usage This Month
          </h3>
          <div className="flex items-center gap-1 text-indigo-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-2xl font-bold">{totalCredits}</span>
            <span className="text-sm text-gray-500 ml-1">credits</span>
          </div>
        </div>

        {usage.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No API usage this month. Create a roadmap or run an analysis to get started!
          </p>
        ) : (
          <>
            {/* Usage Breakdown */}
            <div className="space-y-3">
              {usage.map((item) => {
                const config = OPERATION_LABELS[item.operation] || {
                  label: item.operation,
                  icon: 'M13 10V3L4 14h7v7l9-11h-7z',
                };

                return (
                  <div key={item.operation} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {config.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.usageCount} operation{item.usageCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {item.totalCredits} credit{item.totalCredits !== 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Operations</span>
                <span className="font-medium text-gray-900 dark:text-white">{totalOperations}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
