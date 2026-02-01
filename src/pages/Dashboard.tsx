import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent } from '../components/ui';
import { ApiUsageDisplay } from '../components/ApiUsageDisplay';
import { supabase } from '../lib/supabase';
import type { Roadmap, ApiUsageSummary } from '../types';

export function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);

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
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Your Career Roadmaps
          </h2>
          <Link to="/onboarding">
            <Button>Create New Roadmap</Button>
          </Link>
        </div>

        {/* API Usage */}
        <div className="mb-8">
          <ApiUsageDisplay usage={apiUsage} isLoading={isLoadingUsage} />
        </div>

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
              <Link key={roadmap.id} to={`/roadmap/${roadmap.id}`}>
                <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle>{roadmap.targetCareer}</CardTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Created {new Date(roadmap.createdAt).toLocaleDateString()}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {roadmap.milestones?.length || 0} milestones
                      </span>
                      <span className="text-sm font-medium text-indigo-600">
                        View Details →
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
