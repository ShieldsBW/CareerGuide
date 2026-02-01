import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UserProfile {
  currentJob: string
  yearsExperience: number
  education: string
  availableHours: number
  learningStyle: string
}

interface RequestBody {
  userProfile: UserProfile
  targetCareer: string
  timeframe: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY')
    if (!PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured')
    }

    // Get request body
    const { userProfile, targetCareer, timeframe }: RequestBody = await req.json()

    // Build the prompt for Perplexity
    const systemPrompt = `You are a career guidance expert. Generate a detailed, actionable career roadmap in JSON format.

Your response must be valid JSON with this exact structure:
{
  "summary": "Brief overview of the career transition plan",
  "estimatedTimeline": "Realistic timeline (may differ from requested)",
  "milestones": [
    {
      "title": "Milestone title",
      "description": "What to accomplish",
      "orderIndex": 1,
      "estimatedWeeks": 4,
      "resources": [
        {
          "title": "Resource name",
          "url": "https://...",
          "type": "course|book|video|article|certification",
          "provider": "Provider name",
          "estimatedHours": 20
        }
      ],
      "subtasks": [
        {
          "title": "Specific action item",
          "description": "Brief description of what to do"
        }
      ]
    }
  ],
  "requiredSkills": [
    {
      "skillName": "Skill name",
      "requiredLevel": 4,
      "priority": "critical|high|medium|low"
    }
  ],
  "skillGaps": ["skill1", "skill2"],
  "salaryExpectation": { "entry": 50000, "mid": 75000, "senior": 100000 }
}

IMPORTANT:
- Include 5-8 milestones with specific, actionable steps
- Each milestone MUST have 3-6 subtasks that break down the milestone into concrete actions
- Subtasks should be specific and actionable (e.g., "Complete Python basics course on Codecademy", not just "Learn Python")
- Include 5-10 required skills with proficiency levels (1=Beginner, 5=Expert) and priority
- Search for current courses, certifications, and resources
- Be realistic about timelines`

    const userPrompt = `Create a career transition roadmap for someone with this profile:

Current Role: ${userProfile.currentJob}
Years of Experience: ${userProfile.yearsExperience}
Education: ${userProfile.education}
Available Hours per Week: ${userProfile.availableHours}
Preferred Learning Style: ${userProfile.learningStyle}
Target Career: ${targetCareer}
Desired Timeframe: ${timeframe}

Search for:
1. Current job requirements and skills needed for ${targetCareer}
2. Best online courses and certifications for this transition
3. Salary expectations for ${targetCareer}
4. Realistic timeline for this career change

Generate a comprehensive, milestone-based roadmap with:
- Specific resources and links
- 3-6 subtasks per milestone
- Required skills with proficiency levels`

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
        temperature: 0.2,
        return_citations: true,
        search_recency_filter: 'month'
      }),
    })

    if (!perplexityResponse.ok) {
      const error = await perplexityResponse.text()
      throw new Error(`Perplexity API error: ${error}`)
    }

    const perplexityData = await perplexityResponse.json()
    const content = perplexityData.choices[0].message.content
    const citations = perplexityData.citations || []

    // Parse the JSON response from Perplexity
    let roadmapData
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/)
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content
      roadmapData = JSON.parse(jsonString)
    } catch (parseError) {
      // If parsing fails, create a structured response from the text
      roadmapData = {
        summary: content.substring(0, 500),
        estimatedTimeline: timeframe,
        milestones: [
          {
            title: 'Research Phase',
            description: 'Research the requirements and opportunities in your target field',
            orderIndex: 0,
            estimatedWeeks: 2,
            resources: [],
            subtasks: [
              { title: 'Research job postings for target role', description: 'Look at 10+ job postings to understand common requirements' },
              { title: 'Identify skill gaps', description: 'Compare your current skills to job requirements' },
              { title: 'Connect with professionals', description: 'Reach out to 3-5 people in the target role for informational interviews' }
            ]
          },
          {
            title: 'Skill Building',
            description: 'Develop core skills needed for the role',
            orderIndex: 1,
            estimatedWeeks: 8,
            resources: [],
            subtasks: [
              { title: 'Enroll in foundational course', description: 'Start with a comprehensive introductory course' },
              { title: 'Complete hands-on projects', description: 'Build at least 2 projects to apply your learning' },
              { title: 'Join relevant communities', description: 'Participate in online forums and local meetups' }
            ]
          },
          {
            title: 'Practice & Portfolio',
            description: 'Build practical experience and create a portfolio',
            orderIndex: 2,
            estimatedWeeks: 6,
            resources: [],
            subtasks: [
              { title: 'Create portfolio website', description: 'Showcase your projects and skills online' },
              { title: 'Contribute to open source', description: 'Make contributions to relevant projects' },
              { title: 'Document your work', description: 'Write case studies for your projects' }
            ]
          },
          {
            title: 'Job Search',
            description: 'Apply for positions and prepare for interviews',
            orderIndex: 3,
            estimatedWeeks: 4,
            resources: [],
            subtasks: [
              { title: 'Update resume', description: 'Tailor resume to target role' },
              { title: 'Practice interviews', description: 'Complete mock interviews' },
              { title: 'Apply to positions', description: 'Submit applications to 10+ companies' }
            ]
          }
        ],
        requiredSkills: [],
        skillGaps: [],
        salaryExpectation: {}
      }
    }

    // Format citations
    const formattedCitations = citations.map((url: string, index: number) => ({
      url,
      title: `Source ${index + 1}`
    }))

    return new Response(
      JSON.stringify({
        roadmap: roadmapData,
        citations: formattedCitations,
        rawResponse: content
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
