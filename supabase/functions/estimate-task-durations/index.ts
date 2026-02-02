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

interface DailyGoalOutput {
  sourceTaskId: string
  duration: 'short' | 'medium' | 'long'
  minutes: number
  dailyTitle: string
  isPartialTask: boolean
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

    // Build the task list for the prompt - tasks are already in priority order
    const taskList = tasks.map((t, i) =>
      `${i + 1}. [ID: ${t.id}] "${t.title}" (Milestone: ${t.milestoneTitle})`
    ).join('\n')

    const prompt = `You are creating 3 daily goals for someone who is a BEGINNER breaking into a career as a ${targetCareer || 'professional'}. They need realistic, achievable goals that make meaningful progress.

Here are their upcoming tasks IN PRIORITY ORDER (most important first):
${taskList}

Create exactly 3 daily goals with these SPECIFIC time slots:
1. SHORT goal (~30 minutes): A focused task that can be completed in about 30 minutes
2. MEDIUM goal (~1 hour): A more substantial task requiring about 1 hour
3. LONG goal (~2 hours): A significant task requiring about 2 hours of focused work

IMPORTANT RULES:
- Goals should come from the tasks above, prioritizing earlier tasks in the list
- If a task would take longer than its time slot, create a PARTIAL goal (e.g., "Start section 1 of..." or "Complete first 3 exercises of...")
- If a task fits within the time slot, use it directly
- Each goal must be specific, actionable, and achievable in the given time
- Goals should represent meaningful progress, not busywork
- A single source task can be used for multiple goals if it's large (different portions)

Return ONLY valid JSON in this exact format:
{
  "goals": [
    {
      "sourceTaskId": "exact_uuid_from_task_list",
      "duration": "short",
      "minutes": 30,
      "dailyTitle": "Review introduction to Python basics",
      "isPartialTask": false,
      "reasoning": "This intro section can be completed in 30 minutes"
    },
    {
      "sourceTaskId": "exact_uuid_from_task_list",
      "duration": "medium",
      "minutes": 60,
      "dailyTitle": "Complete first two practice exercises",
      "isPartialTask": true,
      "reasoning": "Full exercise set takes 3 hours; first two exercises are ~1 hour"
    },
    {
      "sourceTaskId": "exact_uuid_from_task_list",
      "duration": "long",
      "minutes": 120,
      "dailyTitle": "Build the header and navigation components",
      "isPartialTask": true,
      "reasoning": "Full project takes 8 hours; header/nav is a solid 2-hour chunk"
    }
  ]
}

Use the EXACT task IDs (UUIDs) from the input list.`

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    })

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text()
      throw new Error(`Perplexity error: ${errText}`)
    }

    const perplexityData = await perplexityRes.json()
    const content = perplexityData.choices?.[0]?.message?.content || ''

    // Parse JSON from response
    let goalsData: { goals: DailyGoalOutput[] } = { goals: [] }
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        goalsData = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Fallback: create default goals from first tasks
      const taskIds = tasks.slice(0, 3)
      goalsData = {
        goals: [
          {
            sourceTaskId: taskIds[0]?.id || '',
            duration: 'short',
            minutes: 30,
            dailyTitle: taskIds[0]?.title || 'Quick task',
            isPartialTask: false,
            reasoning: 'Default short goal'
          },
          {
            sourceTaskId: taskIds[1]?.id || taskIds[0]?.id || '',
            duration: 'medium',
            minutes: 60,
            dailyTitle: taskIds[1]?.title || taskIds[0]?.title || 'Medium task',
            isPartialTask: false,
            reasoning: 'Default medium goal'
          },
          {
            sourceTaskId: taskIds[2]?.id || taskIds[0]?.id || '',
            duration: 'long',
            minutes: 120,
            dailyTitle: taskIds[2]?.title || taskIds[0]?.title || 'Longer task',
            isPartialTask: false,
            reasoning: 'Default long goal'
          }
        ].filter(g => g.sourceTaskId)
      }
    }

    // Validate and ensure we have proper goals
    const taskIdSet = new Set(tasks.map(t => t.id))
    const validGoals = goalsData.goals.filter(g => taskIdSet.has(g.sourceTaskId))

    // If AI didn't return valid goals, create fallbacks
    if (validGoals.length < 3 && tasks.length > 0) {
      const durations: Array<{ duration: 'short' | 'medium' | 'long', minutes: number }> = [
        { duration: 'short', minutes: 30 },
        { duration: 'medium', minutes: 60 },
        { duration: 'long', minutes: 120 }
      ]

      while (validGoals.length < 3 && validGoals.length < tasks.length) {
        const idx = validGoals.length
        const task = tasks[Math.min(idx, tasks.length - 1)]
        const dur = durations[idx]

        if (!validGoals.some(g => g.duration === dur.duration)) {
          validGoals.push({
            sourceTaskId: task.id,
            duration: dur.duration,
            minutes: dur.minutes,
            dailyTitle: task.title,
            isPartialTask: false,
            reasoning: 'Fallback goal'
          })
        }
      }
    }

    // Track usage
    await supabaseAdmin.from('api_usage').insert({
      user_id: user.id,
      operation: 'generate_daily_goals',
      credits_used: 0.5,
      metadata: { task_count: tasks.length }
    })

    return new Response(
      JSON.stringify({ goals: validGoals }),
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
