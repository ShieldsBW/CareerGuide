import { useState } from 'react';
import { Button, Card, CardContent, Input } from './ui';
import type { UserSkill } from '../types';
import { PROFICIENCY_LABELS } from '../types';

interface SkillsEditorProps {
  skills: UserSkill[];
  onAddSkill: (skillName: string, proficiencyLevel: number) => void;
  onUpdateSkill: (skillId: string, proficiencyLevel: number) => void;
  onRemoveSkill: (skillId: string) => void;
  isLoading?: boolean;
}

export function SkillsEditor({
  skills,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  isLoading,
}: SkillsEditorProps) {
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState(3);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  const handleAddSkill = () => {
    if (!newSkillName.trim()) return;
    onAddSkill(newSkillName.trim(), newSkillLevel);
    setNewSkillName('');
    setNewSkillLevel(3);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddSkill();
    }
  };

  return (
    <div className="space-y-6">
      {/* Add New Skill */}
      <Card>
        <CardContent>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Add New Skill
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Proficiency scale: 1 (Beginner) → 5 (Expert)
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Enter skill name (e.g., Python, Project Management)"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
            </div>
            <div className="w-full sm:w-48">
              <select
                value={newSkillLevel}
                onChange={(e) => setNewSkillLevel(Number(e.target.value))}
                className="w-full px-4 py-2 rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              >
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    {level} - {PROFICIENCY_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleAddSkill} disabled={!newSkillName.trim() || isLoading}>
              Add Skill
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skills List */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Your Skills ({skills.length})
        </h3>

        {skills.length === 0 ? (
          <Card variant="bordered">
            <CardContent className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                No skills added yet. Add your first skill above!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {skills.map((skill) => (
              <Card key={skill.id} variant="bordered">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    {/* Skill Name */}
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {skill.skillName}
                      </h4>
                      <p className="text-xs text-gray-500">
                        Added {skill.source === 'manual' ? 'manually' : `via ${skill.source}`}
                      </p>
                    </div>

                    {/* Proficiency Level */}
                    <div className="flex items-center gap-2">
                      {editingSkillId === skill.id ? (
                        <select
                          value={skill.proficiencyLevel}
                          onChange={(e) => {
                            onUpdateSkill(skill.id, Number(e.target.value));
                            setEditingSkillId(null);
                          }}
                          onBlur={() => setEditingSkillId(null)}
                          autoFocus
                          className="px-3 py-1 rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {[1, 2, 3, 4, 5].map((level) => (
                            <option key={level} value={level}>
                              {level} - {PROFICIENCY_LABELS[level]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingSkillId(skill.id)}
                          className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-1 rounded-lg transition-colors"
                        >
                          {/* Progress Bar */}
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((level) => (
                              <div
                                key={level}
                                className={`w-4 h-2 rounded-sm ${
                                  level <= skill.proficiencyLevel
                                    ? 'bg-indigo-600'
                                    : 'bg-gray-200 dark:bg-gray-700'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {PROFICIENCY_LABELS[skill.proficiencyLevel]}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={() => onRemoveSkill(skill.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label="Remove skill"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
