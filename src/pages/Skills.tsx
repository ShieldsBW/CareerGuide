import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { SkillsEditor } from '../components/SkillsEditor';
import { supabase } from '../lib/supabase';
import type { UserSkill } from '../types';

export function Skills() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check auth status
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
        loadSkills(session.user.id);
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

  const loadSkills = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_skills')
        .select('*')
        .eq('user_id', userId)
        .order('skill_name');

      if (error) throw error;

      // Transform snake_case to camelCase
      const transformedSkills: UserSkill[] = (data || []).map((s) => ({
        id: s.id,
        userId: s.user_id,
        skillName: s.skill_name,
        proficiencyLevel: s.proficiency_level,
        source: s.source,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }));

      setSkills(transformedSkills);
    } catch (error) {
      console.error('Error loading skills:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSkill = async (skillName: string, proficiencyLevel: number) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_skills')
        .insert({
          user_id: user.id,
          skill_name: skillName,
          proficiency_level: proficiencyLevel,
          source: 'manual',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation
          alert('You already have this skill in your profile.');
          return;
        }
        throw error;
      }

      // Add to local state
      const newSkill: UserSkill = {
        id: data.id,
        userId: data.user_id,
        skillName: data.skill_name,
        proficiencyLevel: data.proficiency_level,
        source: data.source,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      setSkills((prev) => [...prev, newSkill].sort((a, b) => a.skillName.localeCompare(b.skillName)));
    } catch (error) {
      console.error('Error adding skill:', error);
      alert('Failed to add skill. Please try again.');
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

      // Update local state
      setSkills((prev) =>
        prev.map((s) =>
          s.id === skillId ? { ...s, proficiencyLevel: proficiencyLevel as UserSkill['proficiencyLevel'] } : s
        )
      );
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

      // Remove from local state
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
            <nav className="hidden md:flex items-center gap-4">
              <Link
                to="/dashboard"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                Dashboard
              </Link>
              <span className="text-indigo-600 font-medium">Skills</span>
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
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            to="/dashboard"
            className="text-indigo-600 hover:text-indigo-500 text-sm mb-2 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Your Skills Profile
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Track your skills and proficiency levels. This helps us provide better gap analysis and recommendations.
          </p>
        </div>

        <SkillsEditor
          skills={skills}
          onAddSkill={handleAddSkill}
          onUpdateSkill={handleUpdateSkill}
          onRemoveSkill={handleRemoveSkill}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
}
