import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent } from '../components/ui';
import { ApiUsageDisplay } from '../components/ApiUsageDisplay';
import { DailyGoals } from '../components/DailyGoals';
import { supabase } from '../lib/supabase';
import type { ApiUsageSummary } from '../types';

interface RoadmapData {
  id: string;
  user_id: string;
  target_career: string | null;
  created_at: string | null;
  milestones?: { id: string }[];
}

export function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [roadmaps, setRoadmaps] = useState<RoadmapData[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    // Check auth status
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
        loadRoadmaps(session.user.id);
        loadApiUsage(session.user.id);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadRoadmaps = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('roadmaps')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      setRoadmaps(data || []);
    } catch (error) {
      console.error('Error loading roadmaps:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadApiUsage = async (userId: string) => {
    try {
      // Get first day of current month
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await supabase
        .from('api_usage')
        .select('operation, credits_used')
        .eq('user_id', userId)
        .gte('created_at', firstDayOfMonth);

      if (error) throw error;

      // Aggregate by operation
      const aggregated = (data || []).reduce((acc, item) => {
        const existing = acc.find((a) => a.operation === item.operation);
        if (existing) {
          existing.totalCredits += item.credits_used;
          existing.usageCount += 1;
        } else {
          acc.push({
            operation: item.operation,
            totalCredits: item.credits_used,
            usageCount: 1,
          });
        }
        return acc;
      }, [] as ApiUsageSummary[]);

      setApiUsage(aggregated);
    } catch (error) {
      console.error('Error loading API usage:', error);
    } finally {
      setIsLoadingUsage(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleDeleteRoadmap = async (roadmapId: string) => {
    setDeletingId(roadmapId);
    try {
      const { error } = await supabase
        .from('roadmaps')
        .delete()
        .eq('id', roadmapId);

      if (error) throw error;

      // Remove from local state
      setRoadmaps((prev) => prev.filter((r) => r.id !== roadmapId));
    } catch (error) {
      console.error('Error deleting roadmap:', error);
      alert('Failed to delete roadmap. Please try again.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Generate labels with numbers for duplicates
  const getRoadmapLabel = (roadmap: RoadmapData): string => {
    const career = roadmap.target_career || 'Untitled Roadmap';
    const sameCareerRoadmaps = roadmaps.filter((r) => (r.target_career || '') === (roadmap.target_career || ''));

    if (sameCareerRoadmaps.length > 1) {
      // Find the index of this roadmap among same-career roadmaps (sorted by created_at)
      const sortedSameCareer = [...sameCareerRoadmaps].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateA - dateB;
      });
      const careerIndex = sortedSameCareer.findIndex((r) => r.id === roadmap.id) + 1;
      return `${career} ${careerIndex}`;
    }

    return career;
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-indigo-600">CareerGuide</h1>
            <nav className="hidden md:flex items-center gap-4">
              <span className="text-indigo-600 font-medium">Dashboard</span>
              <Link
                to="/skills"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                Skills
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 dark:text-gray-300 hidden sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Your Career Roadmaps
          </h2>
          <Link to="/onboarding">
            <Button>Create New Roadmap</Button>
          </Link>
        </div>

        {/* Daily Goals - show only if user has roadmaps */}
        {user && roadmaps.length > 0 && (
          <div className="mb-8">
            <DailyGoals userId={user.id} />
          </div>
        )}

        {roadmaps.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No roadmaps yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create your first personalized career roadmap to get started.
              </p>
              <Link to="/onboarding">
                <Button>Create Your First Roadmap</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roadmaps.map((roadmap) => (
              <div key={roadmap.id} className="relative">
                <Card className="hover:shadow-xl transition-shadow h-full">
                  <div className="flex">
                    {/* Main content - clickable to view roadmap */}
                    <Link to={`/roadmap/${roadmap.id}`} className="flex-1 min-w-0">
                      <CardHeader>
                        <CardTitle>{getRoadmapLabel(roadmap)}</CardTitle>
                        {formatDate(roadmap.created_at) && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Created {formatDate(roadmap.created_at)}
                          </p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {roadmap.milestones?.length || 0} milestones
                          </span>
                          <span className="text-sm font-medium text-indigo-600">
                            View →
                          </span>
                        </div>
                      </CardContent>
                    </Link>

                    {/* Delete Button - always visible */}
                    <div className="flex items-start p-2">
                      {confirmDeleteId === roadmap.id ? (
                        <div className="flex flex-col gap-1 bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400 text-center">Delete?</span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === roadmap.id}
                            >
                              No
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleDeleteRoadmap(roadmap.id)}
                              isLoading={deletingId === roadmap.id}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Yes
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(roadmap.id)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete roadmap"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}

        {/* API Usage - collapsible at bottom */}
        <div className="mt-8">
          <ApiUsageDisplay usage={apiUsage} isLoading={isLoadingUsage} />
        </div>
      </main>
    </div>
  );
}
