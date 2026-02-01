import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardContent } from '../components/ui';
import { SkillsEditor } from '../components/SkillsEditor';
import { supabase } from '../lib/supabase';
import type { UserSkill } from '../types';

export function Skills() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importedSkills, setImportedSkills] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

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

  const handleAddSkill = async (skillName: string, proficiencyLevel: number, source: string = 'manual') => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_skills')
        .insert({
          user_id: user.id,
          skill_name: skillName,
          proficiency_level: proficiencyLevel,
          source,
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

  const handleAddImportedSkill = async (skillName: string, proficiencyLevel: number) => {
    await handleAddSkill(skillName, proficiencyLevel, 'pdf');
    // Remove from imported list
    setImportedSkills((prev) => prev.filter((s) => s !== skillName));
  };

  const handleSkipImportedSkill = (skillName: string) => {
    setImportedSkills((prev) => prev.filter((s) => s !== skillName));
  };

  const handleAddAllImported = async (proficiencyLevel: number) => {
    for (const skillName of importedSkills) {
      await handleAddSkill(skillName, proficiencyLevel, 'pdf');
    }
    setImportedSkills([]);
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setImportError('Please upload a PDF file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImportError('File size must be less than 10MB.');
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportedSkills([]);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix to get just base64
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await supabase.functions.invoke('import-pdf-skills', {
        body: { pdfBase64: base64, fileName: file.name },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to process PDF');
      }

      const data = response.data;

      if (!data.success) {
        setImportError(data.error || 'Could not extract skills from this PDF.');
        return;
      }

      if (data.skills && data.skills.length > 0) {
        setImportedSkills(data.skills);
      } else {
        setImportError('No skills found in the document.');
      }
    } catch (error: any) {
      console.error('Error importing PDF:', error);
      setImportError(error.message || 'Failed to process PDF. Please try again.');
    } finally {
      setIsImporting(false);
      // Reset file input
      event.target.value = '';
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

        {/* Import Skills Section */}
        <Card className="mb-6">
          <CardContent>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Import Skills
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Upload your LinkedIn PDF or resume to automatically extract your skills.
            </p>

            {/* PDF Upload */}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                On LinkedIn: Go to your profile → Click "More" → Select "Save to PDF"
              </p>
              <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isImporting ? 'border-gray-300 bg-gray-50 cursor-not-allowed' : 'border-indigo-300 dark:border-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`}>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                  disabled={isImporting}
                  className="hidden"
                />
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-indigo-600"></div>
                    <span className="text-gray-600 dark:text-gray-400">Processing PDF...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-indigo-600 font-medium">Click to upload PDF</span>
                  </>
                )}
              </label>
            </div>

            {importError && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Imported Skills to Review */}
        {importedSkills.length > 0 && (
          <Card className="mb-6 border-2 border-indigo-200 dark:border-indigo-800">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Review Imported Skills ({importedSkills.length})
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set your proficiency level for each skill to add it to your profile.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportedSkills([])}
                >
                  Clear All
                </Button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {importedSkills.map((skillName) => (
                  <div
                    key={skillName}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <span className="flex-1 font-medium text-gray-900 dark:text-white">
                      {skillName}
                    </span>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          onClick={() => handleAddImportedSkill(skillName, level)}
                          className="w-8 h-8 rounded-full border-2 border-indigo-300 dark:border-indigo-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors"
                          title={`Level ${level}`}
                        >
                          {level}
                        </button>
                      ))}
                      <button
                        onClick={() => handleSkipImportedSkill(skillName)}
                        className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Skip this skill"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Or add all skills at once with the same level:
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <Button
                      key={level}
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddAllImported(level)}
                    >
                      All at Level {level}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
