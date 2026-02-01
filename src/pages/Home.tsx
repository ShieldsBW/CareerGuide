import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { supabase } from '../lib/supabase';

export function Home() {
  const navigate = useNavigate();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if we have auth tokens in URL (OAuth callback landed here)
    // Also check for encoded tokens in redirect param (Supabase sometimes does this)
    const hasAuthParams = window.location.hash.includes('access_token') ||
                          window.location.search.includes('code=') ||
                          window.location.search.includes('access_token') ||
                          window.location.search.includes('redirect=');

    const handleAuth = async () => {
      // If tokens are encoded in redirect param, decode and redirect
      const urlParams = new URLSearchParams(window.location.search);
      const redirectParam = urlParams.get('redirect');
      if (redirectParam && redirectParam.includes('access_token')) {
        // Decode the redirect URL and navigate to it
        const decodedUrl = decodeURIComponent(redirectParam);
        // Extract just the hash part with the token
        const hashIndex = decodedUrl.indexOf('#');
        if (hashIndex !== -1) {
          const hashPart = decodedUrl.substring(hashIndex);
          // Redirect to current page with the hash (triggers Supabase auth)
          window.location.href = window.location.origin + '/CareerGuide/' + hashPart;
          return;
        }
      }

      if (hasAuthParams) {
        // We have auth tokens, let Supabase process them
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Clean up URL and redirect based on whether user has roadmaps
          window.history.replaceState(null, '', window.location.pathname);

          // Check if user has existing roadmaps
          const { data: roadmaps } = await supabase
            .from('roadmaps')
            .select('id')
            .eq('user_id', session.user.id)
            .limit(1);

          if (roadmaps && roadmaps.length > 0) {
            navigate('/dashboard');
          } else {
            navigate('/onboarding');
          }
          return;
        }

        // Wait for auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe();
            window.history.replaceState(null, '', window.location.pathname);

            // Check if user has existing roadmaps
            const { data: roadmaps } = await supabase
              .from('roadmaps')
              .select('id')
              .eq('user_id', session.user.id)
              .limit(1);

            if (roadmaps && roadmaps.length > 0) {
              navigate('/dashboard');
            } else {
              navigate('/onboarding');
            }
          }
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          subscription.unsubscribe();
          setIsCheckingAuth(false);
        }, 5000);
      } else {
        // No auth params, check if already logged in
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate('/dashboard');
        } else {
          setIsCheckingAuth(false);
        }
      }
    };

    handleAuth();
  }, [navigate]);

  // Show loading while processing auth
  if (isCheckingAuth && (window.location.hash.includes('access_token') || window.location.search.includes('code='))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin h-10 w-10 text-indigo-600 mx-auto mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-gray-600 dark:text-gray-400">Completing sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Your Personalized Path to a{' '}
            <span className="text-indigo-600">New Career</span>
          </h1>

          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            AI-powered career roadmaps tailored to your goals, skills, and schedule.
            Get a step-by-step plan to transition into your dream career.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/signup">
              <Button size="lg">Get Started Free</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Features */}
          <div className="mt-16 grid md:grid-cols-3 gap-8">
            <div className="p-6">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Personalized Plans
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Roadmaps tailored to your current skills, available time, and learning style.
              </p>
            </div>

            <div className="p-6">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Real-Time Research
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                AI searches current job market data, courses, and salary info just for you.
              </p>
            </div>

            <div className="p-6">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Track Progress
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Stay motivated with milestone tracking and achievement badges.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-gray-500 dark:text-gray-400">
        <p>CareerGuide - Your path to a new career starts here</p>
      </footer>
    </div>
  );
}
