import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  milestoneId: string
  milestoneTitle: string
  milestoneDescription: string
  targetCareer: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    const { milestoneId, milestoneTitle, milestoneDescription, targetCareer }: RequestBody = await req.json()

    if (!milestoneId || !milestoneTitle) {
      throw new Error('milestoneId and milestoneTitle are required')
    }

    // Build the prompt for Perplexity
    const systemPrompt = `You are a career guidance expert. Generate specific, actionable subtasks for a career development milestone.

Your response must be valid JSON with this exact structure:
{
  "subtasks": [
    {
      "title": "Specific action item",
      "description": "Brief description of what to do and why it's important"
    }
  ]
}

IMPORTANT:
- Generate exactly 4-6 subtasks
- Each subtask should be specific and actionable
- Subtasks should be achievable in a reasonable timeframe
- Include a mix of learning, practicing, and applying activities
- Order subtasks logically (foundational first, advanced later)`

    const userPrompt = `Generate subtasks for this career development milestone:

Target Career: ${targetCareer}
Milestone Title: ${milestoneTitle}
Milestone Description: ${milestoneDescription}

Create 4-6 specific, actionable subtasks that will help achieve this milestone. Each subtask should be clear enough that someone can start working on it immediately.`

    // Call Perplexity API
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      }),
    })

    if (!perplexityResponse.ok) {
      const error = await perplexityResponse.text()
      throw new Error(`Perplexity API error: ${error}`)
    }

    const perplexityData = await perplexityResponse.json()
    const content = perplexityData.choices[0].message.content

    // Parse the JSON response
    let subtasksData
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/)
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content
      subtasksData = JSON.parse(jsonString)
    } catch (parseError) {
      // Fallback subtasks if parsing fails
      subtasksData = {
        subtasks: [
          { title: 'Research requirements', description: 'Understand what is needed to complete this milestone' },
          { title: 'Create a plan', description: 'Break down the work into smaller steps' },
          { title: 'Start with fundamentals', description: 'Begin with the basic concepts and skills' },
          { title: 'Practice and apply', description: 'Apply what you have learned through hands-on practice' },
          { title: 'Review and refine', description: 'Review your progress and refine your approach' }
        ]
      }
    }

    // Insert subtasks into database
    const subtasksToInsert = subtasksData.subtasks.map((subtask: { title: string; description?: string }, index: number) => ({
      milestone_id: milestoneId,
      title: subtask.title,
      description: subtask.description || null,
      order_index: index,
      is_completed: false
    }))

    const { data: insertedSubtasks, error: insertError } = await supabaseAdmin
      .from('subtasks')
      .insert(subtasksToInsert)
      .select()

    if (insertError) {
      throw new Error(`Failed to save subtasks: ${insertError.message}`)
    }

    // Track API usage
    await supabaseAdmin
      .from('api_usage')
      .insert({
        user_id: user.id,
        operation: 'generate_subtasks',
        credits_used: 1,
        metadata: { milestone_id: milestoneId }
      })

    return new Response(
      JSON.stringify({
        subtasks: insertedSubtasks,
        message: 'Subtasks generated successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    console.error('Error stack:', error.stack)
    return new Response(
      JSON.stringify({ error: error.message, details: String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
