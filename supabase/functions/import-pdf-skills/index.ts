import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore - pdf-parse types
import pdf from 'https://esm.sh/pdf-parse@1.1.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  console.log('=== Import PDF Skills Function ===')

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

    // Get request body with PDF data
    const { pdfBase64, fileName } = await req.json()

    if (!pdfBase64) {
      throw new Error('PDF data is required')
    }

    console.log('Processing PDF:', fileName || 'unnamed.pdf')

    // Decode base64 to buffer
    const pdfBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))

    // Extract text from PDF
    let pdfText = ''
    try {
      const pdfData = await pdf(pdfBuffer)
      pdfText = pdfData.text
      console.log('Extracted text length:', pdfText.length)
    } catch (pdfError) {
      console.error('PDF parsing error:', pdfError)
      throw new Error('Could not read PDF file. Please make sure it is a valid PDF.')
    }

    if (!pdfText || pdfText.trim().length < 50) {
      throw new Error('Could not extract text from PDF. The file may be image-based or empty.')
    }

    // Truncate if too long (keep first 15000 chars for API limits)
    const truncatedText = pdfText.substring(0, 15000)

    // Call Perplexity to extract skills from the text
    const prompt = `Analyze this resume/LinkedIn profile text and extract ALL professional skills mentioned.

Text:
${truncatedText}

Return ONLY a valid JSON object in this exact format, with no other text:
{
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "profileName": "Person's Name if found",
  "success": true
}

Important guidelines:
- Include technical skills (programming languages, tools, frameworks)
- Include soft skills (leadership, communication, etc.)
- Include domain expertise (marketing, finance, etc.)
- Include certifications and methodologies
- Do NOT include job titles, company names, or education degrees as skills
- Extract actual skill names, not descriptions
- Aim to find 10-50 skills if present`

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
      throw new Error(`AI processing error: ${errText}`)
    }

    const perplexityData = await perplexityRes.json()
    const content = perplexityData.choices?.[0]?.message?.content || ''

    console.log('AI response length:', content.length)

    // Parse JSON from response
    let result = { skills: [], profileName: null, success: false }
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('JSON parse error:', e)
    }

    if (!result.skills || result.skills.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          skills: [],
          error: 'No skills found in the document. Please make sure it contains skill information.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Deduplicate and clean skills
    const uniqueSkills = [...new Set(result.skills.map((s: string) => s.trim()))]
      .filter((s: string) => s.length > 0 && s.length < 100)

    // Track API usage
    await supabaseAdmin.from('api_usage').insert({
      user_id: user.id,
      operation: 'import_pdf_skills',
      credits_used: 1,
      metadata: { file_name: fileName, skills_found: uniqueSkills.length }
    })

    return new Response(
      JSON.stringify({
        success: true,
        skills: uniqueSkills,
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
