import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface TaskInput {
  id: string
  title: string
  milestoneTitle: string
}

interface TaskDuration {
  id: string
  duration: 'short' | 'medium' | 'long'
  minutes: number
  totalMinutes: number
  dailyTitle: string
  reasoning: string
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

    if (!PERPLEXITY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing environment variables')
    }

    // Get auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Create admin client and verify user
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      throw new Error(`Auth failed: ${userError?.message || 'no user'}`)
    }

    // Get request body
    const body = await req.json()
    const { tasks, targetCareer } = body as { tasks: TaskInput[], targetCareer: string }

    if (!tasks || tasks.length === 0) {
      throw new Error('No tasks provided')
    }

    // Build the task list for the prompt
    const taskList = tasks.map((t, i) =>
      `${i + 1}. [ID: ${t.id}] "${t.title}" (Milestone: ${t.milestoneTitle})`
    ).join('\n')

    const prompt = `You are helping estimate task durations for someone who is a BEGINNER trying to break into a career as a ${targetCareer || 'professional'}. They need extra time for learning compared to an experienced professional.

Tasks to estimate:
${taskList}

For EACH task:
1. First estimate the REALISTIC TOTAL time it would take a beginner to fully complete this task (could be hours, days, or even weeks)
2. If the total time exceeds 3 hours (180 minutes), create a "daily portion" - a specific, actionable chunk that can be accomplished in 1-3 hours
3. The daily portion should be a meaningful first step or continuation toward the larger goal

Categories for the daily portion:
- "short": 15-45 minutes
- "medium": 45-90 minutes
- "long": 90-180 minutes (max 3 hours)

Return ONLY valid JSON in this exact format:
{
  "estimates": [
    {
      "id": "exact_task_id_from_input",
      "totalMinutes": 480,
      "minutes": 90,
      "duration": "long",
      "dailyTitle": "Start first module of the course",
      "reasoning": "Full course is ~8 hours; today's goal is completing the intro module"
    }
  ]
}

IMPORTANT:
- "totalMinutes" = realistic total time for the ENTIRE task (can be any number)
- "minutes" = time for TODAY'S achievable portion (max 180)
- "dailyTitle" = if totalMinutes > 180, provide a scoped-down daily goal title; otherwise use the original task title
- Use the EXACT task IDs from the input (they look like UUIDs)`

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    })

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text()
      throw new Error(`Perplexity error: ${errText}`)
    }

    const perplexityData = await perplexityRes.json()
    const content = perplexityData.choices?.[0]?.message?.content || ''

    // Parse JSON from response
    let estimatesData: { estimates: TaskDuration[] } = { estimates: [] }
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        estimatesData = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Fallback: return medium for all tasks
      estimatesData = {
        estimates: tasks.map(t => ({
          id: t.id,
          duration: 'medium' as const,
          minutes: 60,
          totalMinutes: 60,
          dailyTitle: t.title,
          reasoning: 'Default estimate'
        }))
      }
    }

    // Ensure all task IDs are in the response with valid data
    const responseMap = new Map(estimatesData.estimates.map(e => [e.id, e]))
    const taskMap = new Map(tasks.map(t => [t.id, t]))

    const finalEstimates = tasks.map(t => {
      const estimate = responseMap.get(t.id)
      const originalTask = taskMap.get(t.id)

      if (estimate) {
        // Ensure minutes doesn't exceed 180
        const cappedMinutes = Math.min(estimate.minutes || 60, 180)

        // Determine duration category based on capped minutes
        let duration: 'short' | 'medium' | 'long' = 'medium'
        if (cappedMinutes <= 45) duration = 'short'
        else if (cappedMinutes <= 90) duration = 'medium'
        else duration = 'long'

        return {
          id: t.id,
          duration,
          minutes: cappedMinutes,
          totalMinutes: estimate.totalMinutes || cappedMinutes,
          dailyTitle: estimate.dailyTitle || originalTask?.title || t.title,
          reasoning: estimate.reasoning || ''
        }
      }

      // Default fallback
      return {
        id: t.id,
        duration: 'medium' as const,
        minutes: 60,
        totalMinutes: 60,
        dailyTitle: originalTask?.title || t.title,
        reasoning: 'Default estimate'
      }
    })

    // Track usage
    await supabaseAdmin.from('api_usage').insert({
      user_id: user.id,
      operation: 'estimate_task_durations',
      credits_used: 0.5,
      metadata: { task_count: tasks.length }
    })

    return new Response(
      JSON.stringify({ estimates: finalEstimates }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
