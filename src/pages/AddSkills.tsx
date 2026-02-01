import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, Input } from '../components/ui';
import { supabase } from '../lib/supabase';
import { PROFICIENCY_LABELS } from '../types';

export function AddSkills() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importedSkills, setImportedSkills] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState(3);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleAddSkill = async (skillName: string, proficiencyLevel: number, source: string = 'manual') => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_skills')
        .insert({
          user_id: user.id,
          skill_name: skillName,
          proficiency_level: proficiencyLevel,
          source,
        });

      if (error) {
        if (error.code === '23505') {
          alert('You already have this skill in your profile.');
          return;
        }
        throw error;
      }
    } catch (error) {
      console.error('Error adding skill:', error);
      alert('Failed to add skill. Please try again.');
    }
  };

  const handleManualAdd = async () => {
    if (!newSkillName.trim()) return;
    await handleAddSkill(newSkillName.trim(), newSkillLevel, 'manual');
    setNewSkillName('');
    setNewSkillLevel(3);
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
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
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
      event.target.value = '';
    }
  };

  const handleAddImportedSkill = async (skillName: string, proficiencyLevel: number) => {
    await handleAddSkill(skillName, proficiencyLevel, 'pdf');
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

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
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            to="/skills"
            className="text-indigo-600 active:text-indigo-500 text-sm mb-2 inline-block"
          >
            ← Back to Skills Profile
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Add Skills
          </h1>
        </div>

        {/* Import from PDF */}
        <Card className="mb-6">
          <CardContent>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Import from PDF
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Upload your LinkedIn PDF or resume to extract skills automatically.
              On LinkedIn: Profile → More → Save to PDF
            </p>
            <label className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isImporting ? 'border-gray-300 bg-gray-50 cursor-not-allowed' : 'border-indigo-300 dark:border-indigo-600 active:border-indigo-500 active:bg-indigo-50 dark:active:bg-indigo-900/20'}`}>
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
                  <span className="text-indigo-600 font-medium">Upload PDF</span>
                </>
              )}
            </label>

            {importError && (
              <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{importError}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Imported Skills to Review */}
        {importedSkills.length > 0 && (
          <Card className="mb-6 border-2 border-indigo-200 dark:border-indigo-800">
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Review Imported Skills ({importedSkills.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportedSkills([])}
                >
                  Clear
                </Button>
              </div>

              {/* Scale indicator */}
              <div className="flex items-center justify-end gap-1 mb-2 pr-7 text-[10px] text-gray-400">
                <span>Beginner</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div key={level} className="w-6 text-center">{level}</div>
                  ))}
                </div>
                <span>Expert</span>
              </div>

              <div className="space-y-1.5 max-h-64 overflow-y-scroll pr-1 scrollbar-thin">
                {importedSkills.map((skillName) => (
                  <div
                    key={skillName}
                    className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white line-clamp-2 break-words">
                      {skillName}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          onClick={() => handleAddImportedSkill(skillName, level)}
                          className="w-6 h-6 rounded-full border-2 border-indigo-300 dark:border-indigo-600 active:bg-indigo-600 active:text-white text-xs font-medium text-gray-600 dark:text-gray-300 transition-colors"
                        >
                          {level}
                        </button>
                      ))}
                      <button
                        onClick={() => handleSkipImportedSkill(skillName)}
                        className="ml-1 p-0.5 text-gray-400 active:text-red-500"
                        aria-label="Skip"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 mb-2">Add all at same level:</p>
                <div className="flex gap-1 flex-wrap">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <Button
                      key={level}
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddAllImported(level)}
                    >
                      Level {level}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Single Skill */}
        <Card>
          <CardContent>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Add Skill Manually
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              1 = Beginner, 5 = Expert
            </p>
            <div className="space-y-3">
              <Input
                placeholder="Skill name (e.g., Python, Project Management)"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  value={newSkillLevel}
                  onChange={(e) => setNewSkillLevel(Number(e.target.value))}
                  className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm"
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level} - {PROFICIENCY_LABELS[level]}
                    </option>
                  ))}
                </select>
                <Button onClick={handleManualAdd} disabled={!newSkillName.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Link to="/skills">
            <Button variant="outline" className="w-full">
              Done - View Skills Profile
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
