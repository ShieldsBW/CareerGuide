import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Card, CardContent } from '../components/ui';
import { MilestoneCard } from '../components/MilestoneCard';
import { SkillGapAnalysis } from '../components/SkillGapAnalysis';
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
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [targetSkills, setTargetSkills] = useState<TargetRoleSkill[]>([]);
  const [skillGapAnalysis, setSkillGapAnalysis] = useState<SkillGapAnalysisType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('milestones');
  const [generatingSubtasksFor, setGeneratingSubtasksFor] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
              <Link to="/skills">
                <Button variant="outline" size="sm">
                  My Skills
                </Button>
              </Link>
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
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
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Skill Gap Analysis */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Skill Gap Analysis
              </h2>
              <SkillGapAnalysis
                analysis={skillGapAnalysis}
                onRunAnalysis={handleRunAnalysis}
                isLoading={isAnalyzing}
              />
            </div>

            {/* Target Skills */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Required Skills for {roadmap.target_career}
              </h2>

              {/* Action buttons at top */}
              <div className="flex flex-col gap-2 mb-4">
                <Link to="/skills">
                  <Button variant="outline" className="w-full">
                    Manage Your Skills
                  </Button>
                </Link>
                <Button
                  onClick={handleRunAnalysis}
                  isLoading={isAnalyzing}
                  className="w-full"
                >
                  {isAnalyzing ? 'Analyzing...' : 'Analyze Skill Gap'}
                </Button>
              </div>

              {targetSkills.length > 0 ? (
                <Card>
                  <CardContent>
                    <div className="space-y-3">
                      {targetSkills
                        .sort((a, b) => {
                          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                          return priorityOrder[a.priority] - priorityOrder[b.priority];
                        })
                        .map((skill) => (
                          <div
                            key={skill.id}
                            className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {skill.skillName}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-xs rounded-full ${
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
                            <span className="text-sm text-gray-500">
                              Level {skill.requiredLevel}/5
                            </span>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card variant="bordered">
                  <CardContent className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">
                      No required skills defined yet. Run a skill gap analysis to identify required skills.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Citations */}
        {roadmap.citations && roadmap.citations.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Sources
            </h3>
            <Card variant="bordered">
              <CardContent>
                <ul className="space-y-2">
                  {roadmap.citations.map((citation, i) => (
                    <li key={i}>
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-500 text-sm"
                      >
                        [{i + 1}] {citation.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
