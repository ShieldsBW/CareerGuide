import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, Input } from '../components/ui';
import { supabase } from '../lib/supabase';
import type { OnboardingData } from '../types';

const STEPS = [
  { id: 1, title: 'Current Situation' },
  { id: 2, title: 'Resources' },
  { id: 3, title: 'Learning Style' },
  { id: 4, title: 'Career Goal' },
];

export function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [generationStatus, setGenerationStatus] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState<OnboardingData>({
    currentJob: '',
    yearsExperience: 0,
    education: '',
    incomeBracket: '',
    monthlySavings: '',
    availableHours: 10,
    learningStyle: 'mixed',
    targetCareer: '',
    targetTimeframe: '12 months',
  });

  // Check if user is logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
      }
    });
  }, []);

  const updateField = <K extends keyof OnboardingData>(
    field: K,
    value: OnboardingData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsGenerating(true);
    setError('');
    setGenerationStatus('Connecting to AI...');

    try {
      // If not logged in, prompt to sign up first
      if (!userId) {
        // Save form data to session storage for after login
        sessionStorage.setItem('onboardingData', JSON.stringify(formData));
        navigate('/login?redirect=onboarding');
        return;
      }

      // Update user profile
      setGenerationStatus('Saving your profile...');
      await supabase.from('user_profiles').upsert({
        id: userId,
        current_job: formData.currentJob,
        years_experience: formData.yearsExperience,
        education_level: formData.education,
        income_bracket: formData.incomeBracket,
        available_hours: formData.availableHours,
        learning_style: formData.learningStyle,
        updated_at: new Date().toISOString(),
      });

      // Call Edge Function to generate roadmap
      setGenerationStatus('AI is researching your career path...');
      const { data, error: fnError } = await supabase.functions.invoke('generate-roadmap', {
        body: {
          userProfile: {
            currentJob: formData.currentJob,
            yearsExperience: formData.yearsExperience,
            education: formData.education,
            availableHours: formData.availableHours,
            learningStyle: formData.learningStyle,
          },
          targetCareer: formData.targetCareer,
          timeframe: formData.targetTimeframe,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to generate roadmap');
      }

      setGenerationStatus('Creating your personalized roadmap...');

      // Save roadmap to database
      const { data: roadmapData, error: roadmapError } = await supabase
        .from('roadmaps')
        .insert({
          user_id: userId,
          target_career: formData.targetCareer,
          target_date: calculateTargetDate(formData.targetTimeframe),
          ai_generated_plan: data.roadmap,
          citations: data.citations || [],
        })
        .select()
        .single();

      if (roadmapError) {
        throw new Error('Failed to save roadmap');
      }

      // Save milestones
      if (data.roadmap?.milestones && Array.isArray(data.roadmap.milestones)) {
        setGenerationStatus('Setting up your milestones...');

        const milestones = data.roadmap.milestones.map((m: any, index: number) => ({
          roadmap_id: roadmapData.id,
          title: m.title || `Milestone ${index + 1}`,
          description: m.description || '',
          order_index: m.orderIndex ?? index,
          status: 'pending',
          resources: m.resources || [],
        }));

        await supabase.from('milestones').insert(milestones);
      }

      setGenerationStatus('Done! Redirecting to your roadmap...');

      // Redirect to the new roadmap
      setTimeout(() => {
        navigate(`/roadmap/${roadmapData.id}`);
      }, 1000);

    } catch (err) {
      console.error('Error generating roadmap:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  // Calculate target date from timeframe string
  const calculateTargetDate = (timeframe: string): string => {
    const now = new Date();
    let months = 12; // default

    if (timeframe.includes('3')) months = 3;
    else if (timeframe.includes('6')) months = 6;
    else if (timeframe.includes('12')) months = 12;
    else if (timeframe.includes('18')) months = 18;
    else if (timeframe.includes('24') || timeframe.includes('2 year')) months = 24;

    now.setMonth(now.getMonth() + months);
    return now.toISOString().split('T')[0];
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl">
        {/* Progress Steps */}
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between mb-8">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    currentStep >= step.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  }`}
                >
                  {step.id}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-16 sm:w-24 h-1 mx-2 ${
                      currentStep > step.id
                        ? 'bg-indigo-600'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {STEPS[currentStep - 1].title}
          </h2>
        </div>

        <CardContent className="pt-4">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Current Situation */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <Input
                label="Current Job Title"
                value={formData.currentJob}
                onChange={(e) => updateField('currentJob', e.target.value)}
                placeholder="e.g., Marketing Manager, Teacher, Student"
              />

              <Input
                label="Years of Experience"
                type="number"
                value={formData.yearsExperience}
                onChange={(e) => updateField('yearsExperience', parseInt(e.target.value) || 0)}
                min={0}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Education Level
                </label>
                <select
                  value={formData.education}
                  onChange={(e) => updateField('education', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select education level</option>
                  <option value="high_school">High School</option>
                  <option value="some_college">Some College</option>
                  <option value="bachelors">Bachelor's Degree</option>
                  <option value="masters">Master's Degree</option>
                  <option value="phd">PhD/Doctorate</option>
                  <option value="trade">Trade/Vocational</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Resources */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Income Bracket
                </label>
                <select
                  value={formData.incomeBracket}
                  onChange={(e) => updateField('incomeBracket', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select income bracket</option>
                  <option value="under_30k">Under $30,000</option>
                  <option value="30k_50k">$30,000 - $50,000</option>
                  <option value="50k_75k">$50,000 - $75,000</option>
                  <option value="75k_100k">$75,000 - $100,000</option>
                  <option value="over_100k">Over $100,000</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Monthly Budget for Training
                </label>
                <select
                  value={formData.monthlySavings}
                  onChange={(e) => updateField('monthlySavings', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select budget</option>
                  <option value="0">Free resources only</option>
                  <option value="under_50">Under $50/month</option>
                  <option value="50_100">$50 - $100/month</option>
                  <option value="100_250">$100 - $250/month</option>
                  <option value="over_250">Over $250/month</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Hours Available Per Week: {formData.availableHours}
                </label>
                <input
                  type="range"
                  min={1}
                  max={40}
                  value={formData.availableHours}
                  onChange={(e) => updateField('availableHours', parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>1 hr</span>
                  <span>20 hrs</span>
                  <span>40 hrs</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Learning Style */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                How do you prefer to learn new skills?
              </p>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: 'video', label: 'Video Courses', icon: '🎬' },
                  { value: 'reading', label: 'Reading & Articles', icon: '📚' },
                  { value: 'hands-on', label: 'Hands-on Projects', icon: '🛠️' },
                  { value: 'mixed', label: 'Mixed Approach', icon: '🎯' },
                ].map((style) => (
                  <button
                    key={style.value}
                    onClick={() => updateField('learningStyle', style.value as OnboardingData['learningStyle'])}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      formData.learningStyle === style.value
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">{style.icon}</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {style.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Career Goal */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <Input
                label="Target Career"
                value={formData.targetCareer}
                onChange={(e) => updateField('targetCareer', e.target.value)}
                placeholder="e.g., Software Engineer, Data Scientist, UX Designer"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Target Timeframe
                </label>
                <select
                  value={formData.targetTimeframe}
                  onChange={(e) => updateField('targetTimeframe', e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="3 months">3 months</option>
                  <option value="6 months">6 months</option>
                  <option value="12 months">12 months</option>
                  <option value="18 months">18 months</option>
                  <option value="24 months">2 years</option>
                  <option value="flexible">Flexible / No rush</option>
                </select>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-lg mt-6">
                <h4 className="font-medium text-indigo-900 dark:text-indigo-100 mb-2">
                  Ready to generate your roadmap?
                </h4>
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  Our AI will search for current job requirements, training resources,
                  and create a personalized step-by-step plan for you.
                </p>
              </div>
            </div>
          )}

          {/* Generation Status */}
          {isGenerating && generationStatus && (
            <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
              <div className="flex items-center">
                <svg
                  className="animate-spin h-5 w-5 text-indigo-600 mr-3"
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
                <span className="text-indigo-700 dark:text-indigo-300">{generationStatus}</span>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || isGenerating}
            >
              Back
            </Button>

            {currentStep < 4 ? (
              <Button onClick={handleNext}>Continue</Button>
            ) : (
              <Button
                onClick={handleSubmit}
                isLoading={isGenerating}
                disabled={!formData.targetCareer.trim()}
              >
                {isGenerating ? 'Generating...' : 'Generate My Roadmap'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
