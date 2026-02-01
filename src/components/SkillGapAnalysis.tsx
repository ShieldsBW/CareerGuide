import { Button, Card, CardContent } from './ui';
import type { SkillGapAnalysis as SkillGapAnalysisType, SkillGap } from '../types';
import { PROFICIENCY_LABELS } from '../types';

interface SkillGapAnalysisProps {
  analysis: SkillGapAnalysisType | null;
  onRunAnalysis: () => void;
  isLoading?: boolean;
}

export function SkillGapAnalysis({
  analysis,
  onRunAnalysis,
  isLoading,
}: SkillGapAnalysisProps) {
  const getPriorityColor = (priority: SkillGap['priority']) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
  };

  const getReadinessColor = (readiness: number) => {
    if (readiness >= 80) return 'text-green-600';
    if (readiness >= 60) return 'text-yellow-600';
    if (readiness >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  if (!analysis) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Skill Gap Analysis
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Run an AI-powered analysis to see how your current skills compare to your target role.
          </p>
          <Button onClick={onRunAnalysis} isLoading={isLoading}>
            {isLoading ? 'Analyzing...' : 'Run Analysis (1 credit)'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Readiness */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Role Readiness
            </h3>
            <span className={`text-3xl font-bold ${getReadinessColor(analysis.overallReadiness)}`}>
              {analysis.overallReadiness}%
            </span>
          </div>

          {/* Readiness Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-2">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${
                analysis.overallReadiness >= 80
                  ? 'bg-green-500'
                  : analysis.overallReadiness >= 60
                  ? 'bg-yellow-500'
                  : analysis.overallReadiness >= 40
                  ? 'bg-orange-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${analysis.overallReadiness}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Based on your current skills vs. target role requirements
          </p>

          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={onRunAnalysis} isLoading={isLoading}>
              Refresh Analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Critical Skill Gaps */}
      {analysis.criticalGaps.length > 0 && (
        <Card>
          <CardContent>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Skill Gaps to Address
            </h3>
            <div className="space-y-4">
              {analysis.criticalGaps.map((gap, index) => (
                <div key={index} className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {gap.skillName}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(gap.priority)}`}>
                        {gap.priority}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      Gap: {gap.gap} level{gap.gap !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Skill Level Comparison */}
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Current: {PROFICIENCY_LABELS[gap.currentLevel] || 'None'}</span>
                        <span>Required: {PROFICIENCY_LABELS[gap.requiredLevel]}</span>
                      </div>
                      <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                        {/* Current level */}
                        <div
                          className="absolute h-2 bg-indigo-400 rounded-full"
                          style={{ width: `${(gap.currentLevel / 5) * 100}%` }}
                        />
                        {/* Required level marker */}
                        <div
                          className="absolute w-1 h-4 -top-1 bg-indigo-600 rounded"
                          style={{ left: `${(gap.requiredLevel / 5) * 100}%`, transform: 'translateX(-50%)' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {gap.recommendations && gap.recommendations.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {gap.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                          <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* General Recommendations */}
      {analysis.recommendations.length > 0 && (
        <Card>
          <CardContent>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Recommendations
            </h3>
            <ul className="space-y-2">
              {analysis.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium text-indigo-600">
                    {index + 1}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Last Analyzed */}
      <p className="text-xs text-gray-500 text-center">
        Last analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
      </p>
    </div>
  );
}
