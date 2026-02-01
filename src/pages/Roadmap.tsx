import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Card, CardContent } from '../components/ui';
import { supabase } from '../lib/supabase';
import type { Roadmap as RoadmapType, Milestone } from '../types';

export function Roadmap() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState<RoadmapType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadRoadmap(id);
    }
  }, [id]);

  const loadRoadmap = async (roadmapId: string) => {
    try {
      const { data } = await supabase
        .from('roadmaps')
        .select('*, milestones(*)')
        .eq('id', roadmapId)
        .single();

      setRoadmap(data);
    } catch (error) {
      console.error('Error loading roadmap:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateMilestoneStatus = async (
    milestoneId: string,
    status: Milestone['status']
  ) => {
    if (!roadmap) return;

    // Optimistic update
    setRoadmap({
      ...roadmap,
      milestones: roadmap.milestones.map((m) =>
        m.id === milestoneId ? { ...m, status } : m
      ),
    });

    // Update in database
    await supabase
      .from('milestones')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', milestoneId);
  };

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

  const completedCount = roadmap?.milestones.filter((m) => m.status === 'completed').length || 0;
  const totalCount = roadmap?.milestones.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="text-center p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Roadmap not found
          </h2>
          <Link to="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                to="/dashboard"
                className="text-indigo-600 hover:text-indigo-500 text-sm mb-2 inline-block"
              >
                ← Back to Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {roadmap.targetCareer}
              </h1>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              Edit Goal
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Progress Overview */}
        <Card className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Overall Progress
              </h2>
              <span className="text-2xl font-bold text-indigo-600">
                {completedCount}/{totalCount} milestones
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
              <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Milestones */}
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Your Milestones
        </h2>

        <div className="space-y-4">
          {roadmap.milestones
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((milestone, index) => (
              <Card key={milestone.id} variant="bordered">
                <CardContent className="flex items-start gap-4">
                  {/* Step Number */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      milestone.status === 'completed'
                        ? 'bg-green-500 text-white'
                        : milestone.status === 'in_progress'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {milestone.status === 'completed' ? '✓' : index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {milestone.title}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                          milestone.status
                        )}`}
                      >
                        {milestone.status.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      {milestone.description}
                    </p>

                    {/* Resources */}
                    {milestone.resources && milestone.resources.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Resources:
                        </h4>
                        <ul className="space-y-1">
                          {milestone.resources.map((resource, i) => (
                            <li key={i}>
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-500 text-sm"
                              >
                                {resource.title} →
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      {milestone.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => updateMilestoneStatus(milestone.id, 'in_progress')}
                        >
                          Start
                        </Button>
                      )}
                      {milestone.status === 'in_progress' && (
                        <Button
                          size="sm"
                          onClick={() => updateMilestoneStatus(milestone.id, 'completed')}
                        >
                          Mark Complete
                        </Button>
                      )}
                      {milestone.status === 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateMilestoneStatus(milestone.id, 'in_progress')}
                        >
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Citations */}
        {roadmap.citations && roadmap.citations.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Sources
            </h3>
            <Card variant="bordered">
              <CardContent>
                <ul className="space-y-2">
                  {roadmap.citations.map((citation, i) => (
                    <li key={i}>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-500 text-sm"
                      >
                        [{i + 1}] {citation.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
