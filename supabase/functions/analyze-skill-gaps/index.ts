import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  roadmapId: string
  targetCareer: string
}

interface UserSkill {
  skill_name: string
  proficiency_level: number
}

interface TargetSkill {
  skill_name: string
  required_level: number
  priority: string
}

interface SkillGap {
  skillName: string
  currentLevel: number
  requiredLevel: number
  gap: number
  priority: string
  recommendations: string[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured')
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured')
    }

    // Get authorization header for user identification
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header required')
    }

    // Create Supabase client with service role for database operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get user from JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      console.error('Auth error:', userError)
      throw new Error('Invalid authorization token')
    }

    // Get request body
    const { roadmapId, targetCareer }: RequestBody = await req.json()

    if (!roadmapId || !targetCareer) {
      throw new Error('roadmapId and targetCareer are required')
    }

    // Get user's current skills
    const { data: userSkills, error: userSkillsError } = await supabaseAdmin
      .from('user_skills')
      .select('skill_name, proficiency_level')
      .eq('user_id', user.id)

    if (userSkillsError) {
      throw new Error(`Failed to fetch user skills: ${userSkillsError.message}`)
    }

    // Get target role skills
    let { data: targetSkills, error: targetSkillsError } = await supabaseAdmin
      .from('target_role_skills')
      .select('skill_name, required_level, priority')
      .eq('roadmap_id', roadmapId)

    if (targetSkillsError) {
      throw new Error(`Failed to fetch target skills: ${targetSkillsError.message}`)
    }

    // If no target skills exist, generate them using AI
    if (!targetSkills || targetSkills.length === 0) {
      const skillsPrompt = `List the most important skills required for a ${targetCareer} role.

Your response must be valid JSON:
{
  "skills": [
    {
      "skillName": "Skill name",
      "requiredLevel": 4,
      "priority": "critical|high|medium|low"
    }
  ]
}

Include 6-10 skills with:
- requiredLevel: 1 (Beginner) to 5 (Expert)
- priority: how critical the skill is for the role`

      const skillsResponse = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'user', content: skillsPrompt }
          ],
          temperature: 0.2,
        }),
      })

      if (skillsResponse.ok) {
        const skillsData = await skillsResponse.json()
        const content = skillsData.choices[0].message.content

        try {
          const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/)
          const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content
          const parsedSkills = JSON.parse(jsonString)

          // Insert target skills
          const skillsToInsert = parsedSkills.skills.map((skill: { skillName: string; requiredLevel: number; priority: string }) => ({
            roadmap_id: roadmapId,
            skill_name: skill.skillName,
            required_level: Math.min(5, Math.max(1, skill.requiredLevel || 3)),
            priority: ['critical', 'high', 'medium', 'low'].includes(skill.priority) ? skill.priority : 'medium'
          }))

          const { data: insertedSkills } = await supabaseAdmin
            .from('target_role_skills')
            .insert(skillsToInsert)
            .select()

          targetSkills = insertedSkills || []
        } catch (e) {
          console.error('Failed to parse skills:', e)
        }
      }
    }

    // Create skill map for easy lookup
    const userSkillMap = new Map(
      (userSkills || []).map((s: UserSkill) => [s.skill_name.toLowerCase(), s.proficiency_level])
    )

    // Calculate skill gaps
    const skillGaps: SkillGap[] = (targetSkills || []).map((target: TargetSkill) => {
      const currentLevel = userSkillMap.get(target.skill_name.toLowerCase()) || 0
      const gap = Math.max(0, target.required_level - currentLevel)

      return {
        skillName: target.skill_name,
        currentLevel,
        requiredLevel: target.required_level,
        gap,
        priority: target.priority,
        recommendations: []
      }
    }).filter((gap: SkillGap) => gap.gap > 0)
      .sort((a: SkillGap, b: SkillGap) => {
        const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority]
        }
        return b.gap - a.gap
      })

    // Calculate overall readiness
    const totalRequired = (targetSkills || []).reduce((sum: number, s: TargetSkill) => sum + s.required_level, 0)
    const totalAchieved = (targetSkills || []).reduce((sum: number, s: TargetSkill) => {
      const current = userSkillMap.get(s.skill_name.toLowerCase()) || 0
      return sum + Math.min(current, s.required_level)
    }, 0)
    const overallReadiness = totalRequired > 0 ? Math.round((totalAchieved / totalRequired) * 100) : 0

    // Get AI recommendations for top gaps
    let recommendations: string[] = []
    if (skillGaps.length > 0) {
      const topGaps = skillGaps.slice(0, 5)
      const gapsDescription = topGaps
        .map((g: SkillGap) => `${g.skillName} (current: ${g.currentLevel}, required: ${g.requiredLevel})`)
        .join(', ')

      const recPrompt = `A person wants to become a ${targetCareer}. Their main skill gaps are: ${gapsDescription}.

Provide 3-5 actionable recommendations to help them close these gaps. Focus on practical steps they can take immediately.

Your response must be valid JSON:
{
  "recommendations": [
    "Recommendation 1",
    "Recommendation 2"
  ],
  "skillRecommendations": {
    "SkillName": ["Specific recommendation for this skill"]
  }
}`

      const recResponse = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'user', content: recPrompt }
          ],
          temperature: 0.3,
        }),
      })

      if (recResponse.ok) {
        const recData = await recResponse.json()
        const content = recData.choices[0].message.content

        try {
          const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/)
          const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content
          const parsedRec = JSON.parse(jsonString)

          recommendations = parsedRec.recommendations || []

          // Add skill-specific recommendations
          if (parsedRec.skillRecommendations) {
            skillGaps.forEach((gap: SkillGap) => {
              const skillRecs = parsedRec.skillRecommendations[gap.skillName]
              if (skillRecs && Array.isArray(skillRecs)) {
                gap.recommendations = skillRecs
              }
            })
          }
        } catch (e) {
          console.error('Failed to parse recommendations:', e)
          recommendations = [
            'Focus on the highest priority skill gaps first',
            'Consider online courses and certifications',
            'Practice through hands-on projects',
            'Join communities and network with professionals in the field'
          ]
        }
      }
    }

    // Save analysis to database
    const { data: analysis, error: analysisError } = await supabaseAdmin
      .from('skill_gap_analysis')
      .upsert({
        roadmap_id: roadmapId,
        user_id: user.id,
        overall_readiness: overallReadiness,
        critical_gaps: skillGaps,
        recommendations,
        milestone_skill_mapping: {},
        analyzed_at: new Date().toISOString()
      }, {
        onConflict: 'roadmap_id,user_id'
      })
      .select()
      .single()

    if (analysisError) {
      console.error('Failed to save analysis:', analysisError)
    }

    // Track API usage
    await supabaseAdmin
      .from('api_usage')
      .insert({
        user_id: user.id,
        operation: 'analyze_gaps',
        credits_used: 1,
        metadata: { roadmap_id: roadmapId }
      })

    return new Response(
      JSON.stringify({
        analysis: analysis || {
          roadmap_id: roadmapId,
          user_id: user.id,
          overall_readiness: overallReadiness,
          critical_gaps: skillGaps,
          recommendations,
          milestone_skill_mapping: {},
          analyzed_at: new Date().toISOString()
        },
        message: 'Skill gap analysis completed'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
