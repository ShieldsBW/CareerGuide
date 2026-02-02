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
  matchedUserSkill?: string // User skill that matches this requirement
}

interface SkillMatch {
  requiredSkill: string
  userSkill: string
  matchType: 'exact' | 'similar' | 'transferable'
  confidence: number
}

// Normalize skill name for comparison
function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/[.\-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Check if two skills are similar
function areSkillsSimilar(skill1: string, skill2: string): boolean {
  const norm1 = normalizeSkill(skill1)
  const norm2 = normalizeSkill(skill2)

  // Exact match after normalization
  if (norm1 === norm2) return true

  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true

  // Common abbreviations and variations
  const equivalents: Record<string, string[]> = {
    'javascript': ['js', 'ecmascript', 'es6', 'es2015'],
    'typescript': ['ts'],
    'python': ['py', 'python3'],
    'nodejs': ['node', 'node js'],
    'reactjs': ['react', 'reactjs'],
    'vuejs': ['vue', 'vuejs'],
    'angularjs': ['angular'],
    'postgresql': ['postgres', 'psql'],
    'mongodb': ['mongo'],
    'kubernetes': ['k8s'],
    'amazon web services': ['aws'],
    'google cloud platform': ['gcp'],
    'microsoft azure': ['azure'],
    'machine learning': ['ml'],
    'artificial intelligence': ['ai'],
    'natural language processing': ['nlp'],
    'continuous integration': ['ci'],
    'continuous deployment': ['cd'],
    'cicd': ['ci/cd', 'ci cd'],
    'project management': ['pm', 'project mgmt'],
    'user experience': ['ux'],
    'user interface': ['ui'],
    'search engine optimization': ['seo'],
  }

  for (const [main, aliases] of Object.entries(equivalents)) {
    const allVariants = [main, ...aliases]
    const match1 = allVariants.some(v => norm1.includes(v) || v.includes(norm1))
    const match2 = allVariants.some(v => norm2.includes(v) || v.includes(norm2))
    if (match1 && match2) return true
  }

  return false
}

// Find transferable skills (skills that partially meet requirements)
function findTransferableSkills(userSkills: UserSkill[], targetSkill: TargetSkill): SkillMatch | null {
  const transferableMap: Record<string, string[]> = {
    'leadership': ['team management', 'management', 'mentoring', 'coaching'],
    'communication': ['presentation', 'public speaking', 'writing', 'technical writing'],
    'problem solving': ['analytical thinking', 'critical thinking', 'debugging', 'troubleshooting'],
    'programming': ['coding', 'software development', 'development'],
    'data analysis': ['analytics', 'data science', 'statistics', 'excel'],
    'design': ['graphic design', 'visual design', 'ui design', 'ux design'],
    'marketing': ['digital marketing', 'content marketing', 'social media'],
    'sales': ['business development', 'account management', 'customer relations'],
  }

  const targetNorm = normalizeSkill(targetSkill.skill_name)

  for (const [category, related] of Object.entries(transferableMap)) {
    const isTargetInCategory = targetNorm.includes(category) || related.some(r => targetNorm.includes(r))
    if (isTargetInCategory) {
      for (const userSkill of userSkills) {
        const userNorm = normalizeSkill(userSkill.skill_name)
        const isUserInCategory = userNorm.includes(category) || related.some(r => userNorm.includes(r))
        if (isUserInCategory && userSkill.skill_name.toLowerCase() !== targetSkill.skill_name.toLowerCase()) {
          return {
            requiredSkill: targetSkill.skill_name,
            userSkill: userSkill.skill_name,
            matchType: 'transferable',
            confidence: 0.6
          }
        }
      }
    }
  }

  return null
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

    // Auto-add required skills to user_skills (with level 0 = needs rating)
    if (targetSkills && targetSkills.length > 0) {
      const existingSkillNames = new Set((userSkills || []).map((s: UserSkill) => s.skill_name.toLowerCase()))

      const skillsToAdd = targetSkills
        .filter((ts: TargetSkill) => !existingSkillNames.has(ts.skill_name.toLowerCase()))
        .map((ts: TargetSkill) => ({
          user_id: user.id,
          skill_name: ts.skill_name,
          proficiency_level: 0, // 0 indicates "needs rating"
          source: 'role_requirement'
        }))

      if (skillsToAdd.length > 0) {
        await supabaseAdmin
          .from('user_skills')
          .upsert(skillsToAdd, { onConflict: 'user_id,skill_name' })
      }
    }

    // Create skill map for easy lookup (including fuzzy matching)
    const userSkillMap = new Map<string, number>()
    const skillMatches: SkillMatch[] = []

    for (const userSkill of (userSkills || [])) {
      userSkillMap.set(userSkill.skill_name.toLowerCase(), userSkill.proficiency_level)
    }

    // Calculate skill gaps with fuzzy matching
    const skillGaps: SkillGap[] = (targetSkills || []).map((target: TargetSkill) => {
      let currentLevel = userSkillMap.get(target.skill_name.toLowerCase()) || 0
      let matchedUserSkill: string | undefined = undefined

      // If no exact match, try fuzzy matching
      if (currentLevel === 0) {
        for (const userSkill of (userSkills || [])) {
          if (areSkillsSimilar(userSkill.skill_name, target.skill_name)) {
            currentLevel = userSkill.proficiency_level
            matchedUserSkill = userSkill.skill_name
            skillMatches.push({
              requiredSkill: target.skill_name,
              userSkill: userSkill.skill_name,
              matchType: 'similar',
              confidence: 0.9
            })
            break
          }
        }
      }

      // If still no match, check for transferable skills
      if (currentLevel === 0) {
        const transferable = findTransferableSkills(userSkills || [], target)
        if (transferable) {
          // Give partial credit for transferable skills
          const userSkill = (userSkills || []).find((s: UserSkill) => s.skill_name === transferable.userSkill)
          if (userSkill) {
            currentLevel = Math.floor(userSkill.proficiency_level * 0.5) // 50% credit
            matchedUserSkill = `${transferable.userSkill} (transferable)`
            skillMatches.push(transferable)
          }
        }
      }

      const gap = Math.max(0, target.required_level - currentLevel)

      return {
        skillName: target.skill_name,
        currentLevel,
        requiredLevel: target.required_level,
        gap,
        priority: target.priority,
        recommendations: [],
        matchedUserSkill
      }
    }).filter((gap: SkillGap) => gap.gap > 0)
      .sort((a: SkillGap, b: SkillGap) => {
        const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority]
        }
        return b.gap - a.gap
      })

    // Calculate overall readiness (with fuzzy matching considered)
    let totalRequired = 0
    let totalAchieved = 0

    for (const target of (targetSkills || [])) {
      totalRequired += target.required_level

      // Check exact match first
      let current = userSkillMap.get(target.skill_name.toLowerCase()) || 0

      // Then fuzzy match
      if (current === 0) {
        for (const userSkill of (userSkills || [])) {
          if (areSkillsSimilar(userSkill.skill_name, target.skill_name)) {
            current = userSkill.proficiency_level
            break
          }
        }
      }

      totalAchieved += Math.min(current, target.required_level)
    }

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
        milestone_skill_mapping: { skillMatches }, // Store skill matches for display
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
          milestone_skill_mapping: { skillMatches },
          analyzed_at: new Date().toISOString()
        },
        skillMatches, // Return skill matches for frontend display
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
