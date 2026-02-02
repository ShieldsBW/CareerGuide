import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button, Card, CardContent } from '../components/ui';
import { MilestoneCard } from '../components/MilestoneCard';
import { supabase } from '../lib/supabase';
import type { Milestone, Subtask, SkillGapAnalysis as SkillGapAnalysisType, TargetRoleSkill, Citation } from '../types';

type TabType = 'milestones' | 'skills';

// Local type matching database schema (snake_case)
interface RoadmapData {
  id: string;
  user_id: string;
  target_career: string;
  target_date: string;
  citations: Citation[];
  created_at: string;
  milestones: Milestone[];
}

export function Roadmap() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabType) || 'milestones';
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [targetSkills, setTargetSkills] = useState<TargetRoleSkill[]>([]);
  const [skillGapAnalysis, setSkillGapAnalysis] = useState<SkillGapAnalysisType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [generatingSubtasksFor, setGeneratingSubtasksFor] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(true); // Auto-expand when results exist

  useEffect(() => {
    if (id) {
      loadRoadmap(id);
    }
  }, [id]);

  const loadRoadmap = async (roadmapId: string) => {
    try {
      // Load roadmap with milestones
      const { data: roadmapData } = await supabase
        .from('roadmaps')
        .select('*, milestones(*)')
        .eq('id', roadmapId)
        .single();

      if (!roadmapData) {
        setRoadmap(null);
        return;
      }

      // Load subtasks for all milestones
      const milestoneIds = roadmapData.milestones?.map((m: Milestone) => m.id) || [];
      let subtasksData: Subtask[] = [];

      if (milestoneIds.length > 0) {
        const { data: subtasks } = await supabase
          .from('subtasks')
          .select('*')
          .in('milestone_id', milestoneIds)
          .order('order_index');

        subtasksData = (subtasks || []).map((s) => ({
          id: s.id,
          milestoneId: s.milestone_id,
          title: s.title,
          description: s.description,
          orderIndex: s.order_index,
          isCompleted: s.is_completed,
          completedAt: s.completed_at,
        }));
      }

      // Attach subtasks to milestones
      const milestonesWithSubtasks = (roadmapData.milestones || []).map((m: Milestone) => ({
        ...m,
        subtasks: subtasksData.filter((s) => s.milestoneId === m.id),
      }));

      setRoadmap({
        ...roadmapData,
        milestones: milestonesWithSubtasks,
      });

      // Load target skills
      const { data: skills } = await supabase
        .from('target_role_skills')
        .select('*')
        .eq('roadmap_id', roadmapId);

      if (skills) {
        setTargetSkills(skills.map((s) => ({
          id: s.id,
          roadmapId: s.roadmap_id,
          skillName: s.skill_name,
          requiredLevel: s.required_level,
          priority: s.priority,
        })));
      }

      // Load skill gap analysis
      const { data: analysisData } = await supabase
        .from('skill_gap_analysis')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .order('analyzed_at', { ascending: false })
        .limit(1)
        .single();

      if (analysisData) {
        setSkillGapAnalysis({
          id: analysisData.id,
          roadmapId: analysisData.roadmap_id,
          userId: analysisData.user_id,
          overallReadiness: analysisData.overall_readiness,
          criticalGaps: analysisData.critical_gaps || [],
          recommendations: analysisData.recommendations || [],
          milestoneSkillMapping: analysisData.milestone_skill_mapping || {},
          analyzedAt: analysisData.analyzed_at,
        });
      }
    } catch (error) {
      console.error('Error loading roadmap:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateMilestoneStatus = async (
    milestoneId: string,
    status: Milestone['status']
  ) => {
    if (!roadmap) return;

    // Optimistic update
    setRoadmap({
      ...roadmap,
      milestones: roadmap.milestones.map((m) =>
        m.id === milestoneId ? { ...m, status } : m
      ),
    });

    // Update in database
    await supabase
      .from('milestones')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', milestoneId);
  };

  const handleSubtaskToggle = (subtaskId: string, isCompleted: boolean) => {
    if (!roadmap) return;

    // Optimistic update
    setRoadmap({
      ...roadmap,
      milestones: roadmap.milestones.map((m) => ({
        ...m,
        subtasks: m.subtasks?.map((s) =>
          s.id === subtaskId
            ? { ...s, isCompleted, completedAt: isCompleted ? new Date().toISOString() : undefined }
            : s
        ),
      })),
    });
  };

  const handleGenerateSubtasks = async (milestoneId: string) => {
    if (!roadmap) return;

    const milestone = roadmap.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return;

    setGeneratingSubtasksFor(milestoneId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      const response = await supabase.functions.invoke('generate-subtasks', {
        body: {
          milestoneId,
          milestoneTitle: milestone.title,
          milestoneDescription: milestone.description,
          targetCareer: roadmap.target_career,
        },
      });

      if (response.error) {
        console.error('Function error:', response.error);
        throw new Error(response.error.message || JSON.stringify(response.error));
      }

      if (response.data?.error) {
        console.error('Response error:', response.data.error);
        throw new Error(response.data.error);
      }

      const { subtasks: newSubtasks } = response.data;

      // Transform and add to state
      const transformedSubtasks: Subtask[] = newSubtasks.map((s: { id: string; milestone_id: string; title: string; description?: string; order_index: number; is_completed: boolean }) => ({
        id: s.id,
        milestoneId: s.milestone_id,
        title: s.title,
        description: s.description,
        orderIndex: s.order_index,
        isCompleted: s.is_completed,
      }));

      setRoadmap({
        ...roadmap,
        milestones: roadmap.milestones.map((m) =>
          m.id === milestoneId ? { ...m, subtasks: transformedSubtasks } : m
        ),
      });
    } catch (error: any) {
      console.error('Error generating subtasks:', error);
      const errorMessage = error?.message || error?.error || String(error);
      alert(`Failed to generate subtasks: ${errorMessage}`);
    } finally {
      setGeneratingSubtasksFor(null);
    }
  };

  const handleRunAnalysis = async () => {
    if (!roadmap || !id) return;

    setIsAnalyzing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      const response = await supabase.functions.invoke('analyze-skill-gaps', {
        body: {
          roadmapId: id,
          targetCareer: roadmap.target_career,
        },
      });

      if (response.error) throw response.error;

      const { analysis } = response.data;

      setSkillGapAnalysis({
        id: analysis.id,
        roadmapId: analysis.roadmap_id,
        userId: analysis.user_id,
        overallReadiness: analysis.overall_readiness,
        criticalGaps: analysis.critical_gaps || [],
        recommendations: analysis.recommendations || [],
        milestoneSkillMapping: analysis.milestone_skill_mapping || {},
        analyzedAt: analysis.analyzed_at,
      });
    } catch (error) {
      console.error('Error running analysis:', error);
      alert('Failed to run skill gap analysis. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const completedCount = roadmap?.milestones.filter((m) => m.status === 'completed').length || 0;
  const totalCount = roadmap?.milestones.length || 0;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="text-center p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Roadmap not found
          </h2>
          <Link to="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                to="/dashboard"
                className="text-indigo-600 hover:text-indigo-500 text-sm mb-2 inline-block"
              >
                ← Back to Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {roadmap.target_career}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/skills?roadmapId=${id}`}>
                <Button variant="outline" size="sm">
                  My Skills
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                Edit Goal
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Progress Overview */}
        <Card className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Overall Progress
              </h2>
              <span className="text-2xl font-bold text-indigo-600">
                {completedCount}/{totalCount} milestones
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
              <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('milestones')}
            className={`pb-3 px-1 font-medium transition-colors ${
              activeTab === 'milestones'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            Milestones
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`pb-3 px-1 font-medium transition-colors ${
              activeTab === 'skills'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            Skill Gap Analysis
            {skillGapAnalysis && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-600">
                {skillGapAnalysis.overallReadiness}%
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'milestones' ? (
          <>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Your Milestones
            </h2>

            <div className="space-y-4">
              {roadmap.milestones
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((milestone, index) => (
                  <MilestoneCard
                    key={milestone.id}
                    milestone={milestone}
                    index={index}
                    onStatusChange={updateMilestoneStatus}
                    onSubtaskToggle={handleSubtaskToggle}
                    onGenerateSubtasks={handleGenerateSubtasks}
                    isGeneratingSubtasks={generatingSubtasksFor === milestone.id}
                  />
                ))}
            </div>
          </>
        ) : (
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Skill Gap Analysis
            </h2>

            {/* Skill Gap Analysis Results - Top Priority when available */}
            {skillGapAnalysis && (
              <div className="mb-4">
                <button
                  onClick={() => setAnalysisExpanded(!analysisExpanded)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    skillGapAnalysis.overallReadiness >= 80
                      ? 'bg-green-50 dark:bg-green-900/20 active:bg-green-100'
                      : skillGapAnalysis.overallReadiness >= 60
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 active:bg-yellow-100'
                      : 'bg-red-50 dark:bg-red-900/20 active:bg-red-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl font-bold ${
                      skillGapAnalysis.overallReadiness >= 80 ? 'text-green-600' :
                      skillGapAnalysis.overallReadiness >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {skillGapAnalysis.overallReadiness}%
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      Role Readiness
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${analysisExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {analysisExpanded && (
                  <Card className="mt-2">
                    <CardContent>
                      {/* Critical Gaps */}
                      {skillGapAnalysis.criticalGaps.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-medium text-gray-900 dark:text-white mb-2">Skills to Improve</h4>
                          <div className="space-y-2">
                            {skillGapAnalysis.criticalGaps.map((gap, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-900 dark:text-white">{gap.skillName}</span>
                                  <span className={`px-1.5 py-0.5 text-xs rounded ${
                                    gap.priority === 'critical' ? 'bg-red-100 text-red-700' :
                                    gap.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                    'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {gap.priority}
                                  </span>
                                </div>
                                <span className="text-gray-500">
                                  {gap.currentLevel} → {gap.requiredLevel}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommendations */}
                      {skillGapAnalysis.recommendations.length > 0 && (
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white mb-2">Recommendations</h4>
                          <ul className="space-y-1">
                            {skillGapAnalysis.recommendations.slice(0, 5).map((rec, i) => (
                              <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                                <span className="text-indigo-500">•</span>
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 mt-3">
                        Last analyzed: {new Date(skillGapAnalysis.analyzedAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2 mb-4">
              <Link to={`/skills?roadmapId=${id}`}>
                <Button variant="outline" className="w-full">
                  Manage Your Skills
                </Button>
              </Link>
              <Button
                onClick={handleRunAnalysis}
                isLoading={isAnalyzing}
                className="w-full"
              >
                {isAnalyzing ? 'Analyzing...' : skillGapAnalysis ? 'Re-analyze Skills' : 'Analyze Skill Gap'}
              </Button>
            </div>

            {/* Collapsible Required Skills */}
            {targetSkills.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setSkillsExpanded(!skillsExpanded)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                >
                  <span className="font-medium text-gray-900 dark:text-white">
                    Required Skills for {roadmap.target_career} ({targetSkills.length})
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${skillsExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {skillsExpanded && (
                  <Card className="mt-2">
                    <CardContent>
                      <div className="space-y-2">
                        {targetSkills
                          .sort((a, b) => {
                            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                            return priorityOrder[a.priority] - priorityOrder[b.priority];
                          })
                          .map((skill) => (
                            <div
                              key={skill.id}
                              className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  {skill.skillName}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 text-xs rounded-full ${
                                    skill.priority === 'critical'
                                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                      : skill.priority === 'high'
                                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                                      : skill.priority === 'medium'
                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  }`}
                                >
                                  {skill.priority}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">
                                Level {skill.requiredLevel}/5
                              </span>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {targetSkills.length === 0 && !skillGapAnalysis && (
              <Card className="mt-4 border-2 border-indigo-200 dark:border-indigo-800">
                <CardContent className="py-6">
                  <div className="text-center mb-4">
                    <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      Get Started with Skill Analysis
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Add your skills and run an analysis to see how you compare to the requirements for {roadmap.target_career}.
                    </p>
                  </div>
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-medium">1</span>
                      <span>Add your current skills</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-medium">2</span>
                      <span>Run the skill gap analysis</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-medium">3</span>
                      <span>Get personalized recommendations</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
