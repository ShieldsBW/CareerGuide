import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CardContent } from '../components/ui';
import { supabase } from '../lib/supabase';
import type { UserSkill } from '../types';
import { PROFICIENCY_LABELS } from '../types';

export function Skills() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roadmapId = searchParams.get('roadmapId');
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
        loadSkills(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadSkills = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_skills')
        .select('*')
        .eq('user_id', userId)
        .order('skill_name');

      if (error) throw error;

      const transformedSkills: UserSkill[] = (data || []).map((s) => ({
        id: s.id,
        userId: s.user_id,
        skillName: s.skill_name,
        proficiencyLevel: s.proficiency_level,
        source: s.source,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));

      // Sort skills: unrated (level 0) first, then alphabetically
      transformedSkills.sort((a, b) => {
        if (a.proficiencyLevel === 0 && b.proficiencyLevel !== 0) return -1;
        if (a.proficiencyLevel !== 0 && b.proficiencyLevel === 0) return 1;
        return a.skillName.localeCompare(b.skillName);
      });

      setSkills(transformedSkills);
    } catch (error) {
      console.error('Error loading skills:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSkill = async (skillId: string, proficiencyLevel: number) => {
    try {
      const { error } = await supabase
        .from('user_skills')
        .update({
          proficiency_level: proficiencyLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', skillId);

      if (error) throw error;

      setSkills((prev) =>
        prev.map((s) =>
          s.id === skillId ? { ...s, proficiencyLevel: proficiencyLevel as UserSkill['proficiencyLevel'] } : s
        )
      );
      setEditingSkillId(null);
    } catch (error) {
      console.error('Error updating skill:', error);
      alert('Failed to update skill. Please try again.');
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    try {
      const { error } = await supabase
        .from('user_skills')
        .delete()
        .eq('id', skillId);

      if (error) throw error;
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
    } catch (error) {
      console.error('Error removing skill:', error);
      alert('Failed to remove skill. Please try again.');
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
            <Link to="/dashboard" className="text-2xl font-bold text-indigo-600">
              CareerGuide
            </Link>
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
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Navigation */}
        <div className="flex flex-col gap-2 mb-4">
          {roadmapId ? (
            <Link to={`/roadmap/${roadmapId}?tab=skills`}>
              <Button variant="outline" className="w-full">
                ← Back to Skill Gap Analysis
              </Button>
            </Link>
          ) : (
            <Link to="/dashboard">
              <Button variant="outline" className="w-full">
                ← Back to Dashboard
              </Button>
            </Link>
          )}
          <Link to="/skills/add">
            <Button className="w-full">
              + Add Skills
            </Button>
          </Link>
        </div>

        {/* Skills Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Your Skills ({skills.length})
          </h1>
        </div>

        {/* Unrated Skills Alert */}
        {skills.filter(s => s.proficiencyLevel === 0).length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">{skills.filter(s => s.proficiencyLevel === 0).length} skills need rating</span> — Tap to rate your proficiency level for accurate gap analysis.
            </p>
          </div>
        )}

        {/* Skills List */}
        {skills.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                No skills added yet.
              </p>
              <Link to="/skills/add">
                <Button>Add Your First Skill</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className={`flex items-center gap-2 p-2 rounded-lg border ${
                  skill.proficiencyLevel === 0
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                {/* Skill Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {skill.skillName}
                  </p>
                </div>

                {/* Proficiency Level */}
                <div className="flex-shrink-0">
                  {editingSkillId === skill.id ? (
                    <select
                      value={skill.proficiencyLevel}
                      onChange={(e) => handleUpdateSkill(skill.id, Number(e.target.value))}
                      onBlur={() => setEditingSkillId(null)}
                      autoFocus
                      className="px-2 py-1 rounded border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-xs"
                    >
                      {[1, 2, 3, 4, 5].map((level) => (
                        <option key={level} value={level}>
                          {level} - {PROFICIENCY_LABELS[level]}
                        </option>
                      ))}
                    </select>
                  ) : skill.proficiencyLevel === 0 ? (
                    <button
                      onClick={() => setEditingSkillId(skill.id)}
                      className="px-2 py-1 bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-200 rounded text-xs font-medium active:bg-amber-200 dark:active:bg-amber-700"
                    >
                      Tap to rate
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingSkillId(skill.id)}
                      className="flex flex-col items-center active:bg-gray-100 dark:active:bg-gray-700 px-2 py-1 rounded transition-colors"
                    >
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={`w-3 h-1.5 rounded-sm ${
                              level <= skill.proficiencyLevel
                                ? 'bg-indigo-600'
                                : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-gray-500 mt-0.5">
                        {PROFICIENCY_LABELS[skill.proficiencyLevel]}
                      </span>
                    </button>
                  )}
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => handleRemoveSkill(skill.id)}
                  className="p-1 text-gray-400 active:text-red-500 flex-shrink-0"
                  aria-label="Remove skill"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
