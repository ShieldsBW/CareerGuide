import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button, Card, CardContent } from '../components/ui';
import { supabase } from '../lib/supabase';
import { PROFICIENCY_LABELS } from '../types';

interface TargetSkill {
  id: string;
  skillName: string;
  requiredLevel: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export function RateRequiredSkills() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roadmapId = searchParams.get('roadmapId');

  const [user, setUser] = useState<{ id: string } | null>(null);
  const [targetCareer, setTargetCareer] = useState<string>('');
  const [targetSkills, setTargetSkills] = useState<TargetSkill[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    checkAuthAndLoadSkills();
  }, [roadmapId]);

  const checkAuthAndLoadSkills = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      navigate('/login');
      return;
    }

    setUser(session.user);

    if (!roadmapId) {
      navigate('/dashboard');
      return;
    }

    // Load roadmap info
    const { data: roadmap } = await supabase
      .from('roadmaps')
      .select('target_career')
      .eq('id', roadmapId)
      .single();

    const career = roadmap?.target_career || '';
    setTargetCareer(career);

    // Load target skills
    let { data: skills } = await supabase
      .from('target_role_skills')
      .select('id, skill_name, required_level, priority')
      .eq('roadmap_id', roadmapId)
      .order('priority');

    // If no skills found, generate them via analyze-skill-gaps
    if (!skills || skills.length === 0) {
      try {
        await supabase.functions.invoke('analyze-skill-gaps', {
          body: {
            roadmapId,
            targetCareer: career,
          },
        });

        // Reload skills after generation
        const { data: newSkills } = await supabase
          .from('target_role_skills')
          .select('id, skill_name, required_level, priority')
          .eq('roadmap_id', roadmapId)
          .order('priority');

        skills = newSkills;
      } catch (e) {
        console.error('Failed to generate skills:', e);
      }
    }

    if (skills && skills.length > 0) {
      // Sort by priority
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortedSkills = skills
        .map(s => ({
          id: s.id,
          skillName: s.skill_name,
          requiredLevel: s.required_level,
          priority: s.priority as TargetSkill['priority'],
        }))
        .sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

      setTargetSkills(sortedSkills);

      // Initialize ratings
      const initialRatings = new Map<string, number>();
      sortedSkills.forEach(s => initialRatings.set(s.skillName, 0));
      setRatings(initialRatings);
    }

    setIsLoading(false);
  };

  const handleRating = (skillName: string, rating: number) => {
    setRatings(prev => {
      const newRatings = new Map(prev);
      newRatings.set(skillName, rating);
      return newRatings;
    });

    // Auto-advance to next skill after rating
    if (currentIndex < targetSkills.length - 1) {
      setTimeout(() => setCurrentIndex(prev => prev + 1), 300);
    }
  };

  const handleSaveAndContinue = async () => {
    if (!user || !roadmapId) return;

    setIsSaving(true);

    try {
      // Save all rated skills to user_skills
      const skillsToSave = Array.from(ratings.entries())
        .filter(([_, rating]) => rating > 0)
        .map(([skillName, rating]) => ({
          user_id: user.id,
          skill_name: skillName,
          proficiency_level: rating,
          source: 'self_assessment',
        }));

      if (skillsToSave.length > 0) {
        await supabase
          .from('user_skills')
          .upsert(skillsToSave, { onConflict: 'user_id,skill_name' });
      }

      // Also save unrated skills with level 0 so they appear in the skills list
      const unratedSkills = Array.from(ratings.entries())
        .filter(([_, rating]) => rating === 0)
        .map(([skillName]) => ({
          user_id: user.id,
          skill_name: skillName,
          proficiency_level: 0,
          source: 'role_requirement',
        }));

      if (unratedSkills.length > 0) {
        await supabase
          .from('user_skills')
          .upsert(unratedSkills, { onConflict: 'user_id,skill_name' });
      }

      // Run skill gap analysis
      await supabase.functions.invoke('analyze-skill-gaps', {
        body: {
          roadmapId,
          targetCareer,
        },
      });

      // Navigate to roadmap with skills tab
      navigate(`/roadmap/${roadmapId}?tab=skills`);
    } catch (error) {
      console.error('Error saving skills:', error);
      alert('Failed to save skills. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!user || !roadmapId) return;

    setIsSaving(true);

    try {
      // Save all skills with level 0 (unrated)
      const skillsToSave = targetSkills.map(skill => ({
        user_id: user.id,
        skill_name: skill.skillName,
        proficiency_level: 0,
        source: 'role_requirement',
      }));

      if (skillsToSave.length > 0) {
        await supabase
          .from('user_skills')
          .upsert(skillsToSave, { onConflict: 'user_id,skill_name' });
      }

      // Navigate to roadmap
      navigate(`/roadmap/${roadmapId}?tab=skills`);
    } catch (error) {
      console.error('Error:', error);
      navigate(`/roadmap/${roadmapId}?tab=skills`);
    }
  };

  const ratedCount = Array.from(ratings.values()).filter(r => r > 0).length;
  const totalCount = targetSkills.length;
  const currentSkill = targetSkills[currentIndex];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (targetSkills.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-8">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No required skills found for this roadmap.
            </p>
            <Link to={roadmapId ? `/roadmap/${roadmapId}` : '/dashboard'}>
              <Button>Continue to Roadmap</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Rate Your Skills
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            for {targetCareer}
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {ratedCount} of {totalCount} skills rated
            </span>
            <span className="text-sm font-medium text-indigo-600">
              {Math.round((ratedCount / totalCount) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(ratedCount / totalCount) * 100}%` }}
            />
          </div>
        </div>

        {/* Current Skill Card */}
        {currentSkill && (
          <Card className="mb-6">
            <CardContent className="py-6">
              <div className="flex items-center justify-between mb-4">
                <span className={`px-2 py-1 text-xs rounded-full ${
                  currentSkill.priority === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                  currentSkill.priority === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                  currentSkill.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                }`}>
                  {currentSkill.priority} priority
                </span>
                <span className="text-sm text-gray-500">
                  Required level: {currentSkill.requiredLevel}/5
                </span>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {currentSkill.skillName}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                How would you rate your current proficiency?
              </p>

              {/* Rating Buttons */}
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((level) => {
                  const isSelected = ratings.get(currentSkill.skillName) === level;
                  return (
                    <button
                      key={level}
                      onClick={() => handleRating(currentSkill.skillName, level)}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}>
                            {level}
                          </span>
                          <span className={`font-medium ${isSelected ? 'text-indigo-600' : 'text-gray-900 dark:text-white'}`}>
                            {PROFICIENCY_LABELS[level]}
                          </span>
                        </div>
                        {isSelected && (
                          <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* No experience option */}
                <button
                  onClick={() => {
                    handleRating(currentSkill.skillName, 0);
                    if (currentIndex < targetSkills.length - 1) {
                      setTimeout(() => setCurrentIndex(prev => prev + 1), 300);
                    }
                  }}
                  className={`w-full p-3 rounded-lg border-2 text-center transition-all ${
                    ratings.get(currentSkill.skillName) === 0
                      ? 'border-gray-400 bg-gray-100 dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-gray-500">No experience with this skill</span>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 disabled:opacity-50"
          >
            ← Previous
          </button>

          <div className="flex gap-1">
            {targetSkills.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentIndex
                    ? 'bg-indigo-600'
                    : ratings.get(targetSkills[idx].skillName)
                    ? 'bg-indigo-300'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setCurrentIndex(prev => Math.min(targetSkills.length - 1, prev + 1))}
            disabled={currentIndex === targetSkills.length - 1}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 disabled:opacity-50"
          >
            Next →
          </button>
        </div>

        {/* All Skills Summary */}
        <Card className="mb-6">
          <CardContent>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
              All Required Skills
            </h3>
            <div className="space-y-2">
              {targetSkills.map((skill, idx) => {
                const rating = ratings.get(skill.skillName) || 0;
                return (
                  <button
                    key={skill.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                      idx === currentIndex
                        ? 'bg-indigo-50 dark:bg-indigo-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className={`text-sm ${rating > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500'}`}>
                      {skill.skillName}
                    </span>
                    {rating > 0 ? (
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`w-3 h-1.5 rounded-sm ${
                              level <= rating ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not rated</span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={handleSaveAndContinue}
            isLoading={isSaving}
            disabled={ratedCount === 0}
            className="w-full"
          >
            {isSaving ? 'Analyzing Skills...' : `Save & Analyze Skills (${ratedCount} rated)`}
          </Button>

          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Skip for now — I'll rate my skills later
          </button>
        </div>
      </main>
    </div>
  );
}
