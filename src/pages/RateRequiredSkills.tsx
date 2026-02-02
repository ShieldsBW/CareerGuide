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
  const [isReviewMode, setIsReviewMode] = useState(false);

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

    // If this is the last skill, switch to review mode
    if (currentIndex === targetSkills.length - 1) {
      setTimeout(() => setIsReviewMode(true), 400);
    } else {
      // Auto-advance to next skill after rating
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

  const handleEditSkill = (index: number) => {
    setCurrentIndex(index);
    setIsReviewMode(false);
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

  // Review Mode - Show summary and save button
  if (isReviewMode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow flex-shrink-0">
          <div className="max-w-2xl mx-auto px-4 py-3">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Review Your Ratings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {targetCareer}
            </p>
          </div>
        </header>

        <main className="flex-1 flex flex-col max-w-2xl mx-auto px-4 py-4 w-full">
          {/* Summary Card */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="flex-1 overflow-y-auto py-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {ratedCount} of {totalCount} skills rated
                </span>
                <span className="text-sm text-indigo-600 font-medium">
                  {Math.round((ratedCount / totalCount) * 100)}% complete
                </span>
              </div>

              <div className="space-y-1">
                {targetSkills.map((skill, idx) => {
                  const rating = ratings.get(skill.skillName) || 0;
                  return (
                    <button
                      key={skill.id}
                      onClick={() => handleEditSkill(idx)}
                      className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className={`text-sm flex-1 truncate ${rating > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                        {skill.skillName}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {rating > 0 ? (
                          <>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((level) => (
                                <div
                                  key={level}
                                  className={`w-2 h-1.5 rounded-sm ${
                                    level <= rating ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-gray-500 w-16 text-right">
                              {PROFICIENCY_LABELS[rating]}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Not rated</span>
                        )}
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons - Fixed at bottom */}
          <div className="flex-shrink-0 pt-4 space-y-2">
            <Button
              onClick={handleSaveAndContinue}
              isLoading={isSaving}
              disabled={ratedCount === 0}
              className="w-full"
            >
              {isSaving ? 'Analyzing Skills...' : 'Save & Analyze Skills'}
            </Button>

            <button
              onClick={handleSkip}
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-2"
            >
              Skip for now
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Rating Mode - Show current skill card
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                Rate Your Skills
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {targetCareer}
              </p>
            </div>
            <span className="text-sm text-gray-500">
              {currentIndex + 1} / {totalCount}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl mx-auto px-4 py-4 w-full">
        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-4 flex-shrink-0">
          <div
            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
          />
        </div>

        {/* Current Skill Card */}
        {currentSkill && (
          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="flex-1 flex flex-col py-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  currentSkill.priority === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                  currentSkill.priority === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                  currentSkill.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                }`}>
                  {currentSkill.priority}
                </span>
                <span className="text-xs text-gray-500">
                  Required: {currentSkill.requiredLevel}/5
                </span>
              </div>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {currentSkill.skillName}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Rate your current proficiency
              </p>

              {/* Rating Buttons */}
              <div className="space-y-1.5 flex-1">
                {[1, 2, 3, 4, 5].map((level) => {
                  const isSelected = ratings.get(currentSkill.skillName) === level;
                  return (
                    <button
                      key={level}
                      onClick={() => handleRating(currentSkill.skillName, level)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                          : 'border-gray-200 dark:border-gray-700 active:border-indigo-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>
                          {level}
                        </span>
                        <span className={`text-sm font-medium ${isSelected ? 'text-indigo-600' : 'text-gray-900 dark:text-white'}`}>
                          {PROFICIENCY_LABELS[level]}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* No experience option */}
                <button
                  onClick={() => handleRating(currentSkill.skillName, 0)}
                  className={`w-full p-2.5 rounded-lg border-2 text-center transition-all ${
                    ratings.get(currentSkill.skillName) === 0
                      ? 'border-gray-400 bg-gray-100 dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 active:border-gray-400'
                  }`}
                >
                  <span className="text-sm text-gray-500">No experience</span>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-3 flex-shrink-0">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 disabled:opacity-30"
          >
            ← Back
          </button>

          <div className="flex gap-1">
            {targetSkills.map((skill, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentIndex
                    ? 'bg-indigo-600'
                    : ratings.get(skill.skillName)
                    ? 'bg-indigo-300'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => {
              if (currentIndex === targetSkills.length - 1) {
                setIsReviewMode(true);
              } else {
                setCurrentIndex(prev => prev + 1);
              }
            }}
            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400"
          >
            {currentIndex === targetSkills.length - 1 ? 'Review →' : 'Skip →'}
          </button>
        </div>
      </main>
    </div>
  );
}
