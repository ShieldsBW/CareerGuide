import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('=== Generate Subtasks Function ===')
  console.log('Method:', req.method)
  console.log('URL:', req.url)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight')
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  try {
    console.log('Checking environment variables...')
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    console.log('PERPLEXITY_API_KEY exists:', !!PERPLEXITY_API_KEY)
    console.log('SUPABASE_URL exists:', !!SUPABASE_URL)
    console.log('SERVICE_ROLE_KEY exists:', !!SUPABASE_SERVICE_ROLE_KEY)

    if (!PERPLEXITY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing environment variables')
    }

    // Get auth header
    console.log('Checking authorization header...')
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header exists:', !!authHeader)

    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Create admin client and verify user
    console.log('Creating Supabase admin client...')
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    console.log('Verifying user token...')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      console.log('Auth error:', userError)
      throw new Error(`Auth failed: ${userError?.message || 'no user'}`)
    }
    console.log('User verified:', user.id)

    // Get request body
    console.log('Parsing request body...')
    const body = await req.json()
    console.log('Body received:', JSON.stringify(body))
    const { milestoneId, milestoneTitle, milestoneDescription, targetCareer } = body

    if (!milestoneId || !milestoneTitle) {
      throw new Error('Missing milestoneId or milestoneTitle')
    }

    console.log('Calling Perplexity API...')
    // Call Perplexity API
    const prompt = `Generate 4-5 specific subtasks for this career milestone. Return ONLY valid JSON in this format: {"subtasks": [{"title": "task", "description": "details"}]}

Milestone: ${milestoneTitle}
Description: ${milestoneDescription || 'N/A'}
Target Career: ${targetCareer || 'N/A'}`

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    })

    console.log('Perplexity response status:', perplexityRes.status)

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text()
      console.log('Perplexity error:', errText)
      throw new Error(`Perplexity error: ${errText}`)
    }

    const perplexityData = await perplexityRes.json()
    const content = perplexityData.choices?.[0]?.message?.content || ''
    console.log('Perplexity content length:', content.length)

    // Parse JSON from response
    let subtasksData = { subtasks: [] }
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        subtasksData = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Fallback
      subtasksData = {
        subtasks: [
          { title: 'Research the topic', description: 'Gather information about this milestone' },
          { title: 'Create an action plan', description: 'Outline specific steps to complete' },
          { title: 'Begin implementation', description: 'Start working on the first steps' },
          { title: 'Review progress', description: 'Check your progress and adjust as needed' }
        ]
      }
    }

    // Insert subtasks
    const subtasksToInsert = (subtasksData.subtasks || []).map((s: any, i: number) => ({
      milestone_id: milestoneId,
      title: s.title || `Task ${i + 1}`,
      description: s.description || null,
      order_index: i,
      is_completed: false
    }))

    const { data: insertedSubtasks, error: insertError } = await supabaseAdmin
      .from('subtasks')
      .insert(subtasksToInsert)
      .select()

    if (insertError) {
      throw new Error(`DB error: ${insertError.message}`)
    }

    // Track usage
    await supabaseAdmin.from('api_usage').insert({
      user_id: user.id,
      operation: 'generate_subtasks',
      credits_used: 1,
      metadata: { milestone_id: milestoneId }
    })

    return new Response(
      JSON.stringify({ subtasks: insertedSubtasks }),
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
