import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('=== Import LinkedIn Skills Function ===')

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
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
    const { linkedinUrl } = await req.json()

    if (!linkedinUrl) {
      throw new Error('LinkedIn URL is required')
    }

    // Validate it looks like a LinkedIn URL
    if (!linkedinUrl.includes('linkedin.com/in/')) {
      throw new Error('Please provide a valid LinkedIn profile URL (e.g., https://linkedin.com/in/username)')
    }

    console.log('Fetching skills from:', linkedinUrl)

    // Call Perplexity to extract skills from LinkedIn profile
    const prompt = `Visit this LinkedIn profile and extract ALL skills listed in the Skills section: ${linkedinUrl}

Return ONLY a valid JSON object in this exact format, with no other text:
{
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "profileName": "Person's Name",
  "success": true
}

If you cannot access the profile or find skills, return:
{
  "skills": [],
  "profileName": null,
  "success": false,
  "error": "Brief reason why"
}

Important: Only include actual skill names, not categories or headers.`

    const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    })

    if (!perplexityRes.ok) {
      const errText = await perplexityRes.text()
      throw new Error(`Perplexity error: ${errText}`)
    }

    const perplexityData = await perplexityRes.json()
    const content = perplexityData.choices?.[0]?.message?.content || ''

    console.log('Perplexity response:', content)

    // Parse JSON from response
    let result = { skills: [], profileName: null, success: false, error: 'Failed to parse response' }
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('JSON parse error:', e)
    }

    if (!result.success || result.skills.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          skills: [],
          error: result.error || 'Could not find skills. Make sure your LinkedIn profile is set to public visibility.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Track API usage
    await supabaseAdmin.from('api_usage').insert({
      user_id: user.id,
      operation: 'import_linkedin_skills',
      credits_used: 1,
      metadata: { linkedin_url: linkedinUrl, skills_found: result.skills.length }
    })

    return new Response(
      JSON.stringify({
        success: true,
        skills: result.skills,
        profileName: result.profileName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message, skills: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
