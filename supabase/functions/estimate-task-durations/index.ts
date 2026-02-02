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
      `${i + 1}. "${t.title}" (Milestone: ${t.milestoneTitle})`
    ).join('\n')

    const prompt = `Estimate realistic time durations for these career development tasks. The person is a BEGINNER who is trying to break into a new career as a ${targetCareer || 'professional'}. They may need extra time for learning, research, and practice compared to someone already experienced in the field.

Tasks:
${taskList}

For each task, estimate how long it would realistically take a motivated beginner. Categorize into:
- "short": 15-45 minutes (quick reads, signups, simple research)
- "medium": 45-90 minutes (tutorials, practice exercises, deeper research)
- "long": 90-180 minutes (courses, projects, complex implementations)

Never estimate more than 3 hours (180 minutes) for any single task.

Return ONLY valid JSON in this exact format:
{
  "estimates": [
    {"id": "task_id_here", "duration": "short|medium|long", "minutes": 30, "reasoning": "brief explanation"}
  ]
}

Use the exact task IDs from the input.`

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
          reasoning: 'Default estimate'
        }))
      }
    }

    // Ensure all task IDs are in the response
    const responseMap = new Map(estimatesData.estimates.map(e => [e.id, e]))
    const finalEstimates = tasks.map(t => {
      const estimate = responseMap.get(t.id)
      if (estimate) {
        // Ensure minutes doesn't exceed 180
        return {
          ...estimate,
          minutes: Math.min(estimate.minutes || 60, 180)
        }
      }
      // Default fallback
      return {
        id: t.id,
        duration: 'medium' as const,
        minutes: 60,
        reasoning: 'Default estimate'
      }
    })

    // Track usage (minimal credits for this operation)
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
