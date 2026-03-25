import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express, { type Request, type Response } from 'express'
import OpenAI from 'openai'

loadEnvFiles()

const foodReference = [
  { name: 'Apple', serving: '1 medium apple', carbs: 25, category: 'Fruit' },
  { name: 'Banana', serving: '1 medium banana', carbs: 27, category: 'Fruit' },
  { name: 'Bread, whole wheat', serving: '1 slice', carbs: 15, category: 'Grain' },
  { name: 'Milk', serving: '1 cup', carbs: 12, category: 'Drink' },
  { name: 'Oatmeal, cooked', serving: '1 cup', carbs: 27, category: 'Breakfast' },
  { name: 'Pasta, cooked', serving: '1 cup', carbs: 43, category: 'Meal' },
  { name: 'Pizza slice', serving: '1 slice', carbs: 36, category: 'Meal' },
  { name: 'Potato, baked', serving: '1 medium potato', carbs: 37, category: 'Meal' },
  { name: 'Rice, cooked', serving: '1 cup', carbs: 45, category: 'Grain' },
  { name: 'Yogurt, plain', serving: '1 cup', carbs: 17, category: 'Snack' },
] as const

interface StartServerOptions {
  port?: number
  model?: string
  apiKey?: string
  enableCors?: boolean
}

export function createApiServer(options: StartServerOptions = {}) {
  const app = express()
  const port = Number(options.port ?? process.env.PORT ?? 3001)
  const model = options.model ?? process.env.OPENROUTER_MODEL ?? process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini'
  const apiKey = normalizeOpenRouterKey(options.apiKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? '')
  const client = apiKey
    ? new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://glucopilot.app',
          'X-OpenRouter-Title': 'GlucoPilot',
        },
      })
    : null

  if (options.enableCors ?? true) {
    app.use(cors())
  }

  app.use(express.json())

  app.get('/api/health', (_request: Request, response: Response) => {
    response.json({
      ok: true,
      aiConfigured: Boolean(client),
      model,
    })
  })

  app.post('/api/ai/coach', async (request: Request, response: Response) => {
    const question = String(request.body?.question ?? '').trim()
    const summary = String(request.body?.summary ?? '').trim()

    if (!question) {
      response.status(400).json({ error: 'Question is required.' })
      return
    }

    if (!client) {
      response.json({
        answer: buildFallbackCoachReply(question),
        source: 'fallback',
      })
      return
    }

    try {
      const aiResponse = await client.chat.completions.create({
        model,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'You are a calm assistant inside a type 1 diabetes support app. Give short, practical education and planning help. Do not prescribe insulin doses, do not replace a clinician, and tell the user to seek urgent medical help for severe low blood sugar, breathing trouble, vomiting, confusion, or ketones with high glucose.',
          },
          {
            role: 'user',
            content: `User question: ${question}\n\nApp summary: ${summary || 'No summary provided.'}\n\nAnswer in plain language with 2 short paragraphs maximum.`,
          },
        ],
      })

      response.json({
        answer: readMessageContent(aiResponse.choices[0]?.message?.content),
        source: 'openrouter',
      })
    } catch (error) {
      console.error('Coach request failed:', error)
      response.status(200).json({
        answer: buildFallbackCoachReply(question),
        source: 'fallback',
        warning: formatAiWarning(error),
      })
    }
  })

  app.post('/api/foods/estimate', async (request: Request, response: Response) => {
    const foodName = String(request.body?.foodName ?? '').trim()
    const serving = String(request.body?.serving ?? '').trim()

    if (!foodName) {
      response.status(400).json({ error: 'Food name is required.' })
      return
    }

    const localMatch = findLocalFood(foodName)
    if (localMatch) {
      response.json({
        ...localMatch,
        source: 'reference',
        note: 'Matched from the built-in food library.',
      })
      return
    }

    if (!client) {
      response.json({
        ...estimateFoodHeuristic(foodName, serving),
        source: 'fallback',
      })
      return
    }

    try {
      const aiResponse = await client.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Estimate typical carbohydrate grams for food serving sizes in a type 1 diabetes support app. Return valid JSON only. Do not include markdown.',
          },
          {
            role: 'user',
            content: `Estimate carbs for "${foodName}" with serving "${serving || '1 serving'}". Return JSON with keys: name, serving, carbs, category, note. carbs must be a number.`,
          },
        ],
      })

      const parsed = parseJsonObject(readMessageContent(aiResponse.choices[0]?.message?.content))
      response.json({
        name: String(parsed.name ?? foodName),
        serving: String(parsed.serving ?? (serving || '1 serving')),
        carbs: clampNumber(parsed.carbs),
        category: String(parsed.category ?? 'Custom'),
        note: String(
          parsed.note ??
            'AI estimate. Please verify with a nutrition label or diabetes care team when accuracy matters.',
        ),
        source: 'openrouter',
      })
    } catch (error) {
      console.error('Food estimate request failed:', error)
      response.status(200).json({
        ...estimateFoodHeuristic(foodName, serving),
        source: 'fallback',
        warning: formatAiWarning(error),
      })
    }
  })

  return {
    app,
    port,
    model,
    aiConfigured: Boolean(client),
  }
}

export function startApiServer(options: StartServerOptions = {}) {
  const { app, port, model, aiConfigured } = createApiServer(options)
  const server = app.listen(port, () => {
    console.log(`GlucoPilot API listening on http://localhost:${port} using ${model} (${aiConfigured ? 'AI enabled' : 'fallback mode'})`)
  })

  return {
    server,
    port,
    model,
    aiConfigured,
  }
}

function buildFallbackCoachReply(question: string) {
  const lowered = question.toLowerCase()

  if (lowered.includes('low') || lowered.includes('hypo')) {
    return 'If you think you are going low, use your usual care plan and fast carbs you trust, then recheck based on your clinician guidance. If symptoms are severe, you are confused, or you cannot keep food down, get urgent medical help.'
  }

  if (lowered.includes('high') || lowered.includes('ketone')) {
    return 'High glucose with ketones, vomiting, or trouble breathing needs urgent attention. For everyday planning, review hydration, site issues, missed insulin, and your clinician-approved sick day plan.'
  }

  if (lowered.includes('meal') || lowered.includes('food') || lowered.includes('carb')) {
    return 'Start with a consistent serving size, check the label when you have it, and log foods you eat often so your routine gets faster. For dosing changes, use your own diabetes plan and clinician advice rather than this app.'
  }

  return 'This app can help with food carbs, reminders, glucose notes, and question prompts. For treatment decisions like insulin dose changes, confirm with your diabetes care plan or clinician.'
}

function findLocalFood(foodName: string) {
  const lowered = foodName.toLowerCase()
  return foodReference.find((food) => food.name.toLowerCase().includes(lowered))
}

function estimateFoodHeuristic(foodName: string, serving: string) {
  const lowered = foodName.toLowerCase()

  if (lowered.includes('juice') || lowered.includes('smoothie')) {
    return {
      name: foodName,
      serving: serving || '1 cup',
      carbs: 26,
      category: 'Drink',
      note: 'Fallback estimate for sweet drinks. Verify the label when available.',
    }
  }

  if (lowered.includes('rice') || lowered.includes('pasta') || lowered.includes('noodle')) {
    return {
      name: foodName,
      serving: serving || '1 cup',
      carbs: 42,
      category: 'Grain',
      note: 'Fallback estimate for cooked grains or noodles.',
    }
  }

  if (lowered.includes('bread') || lowered.includes('toast') || lowered.includes('tortilla')) {
    return {
      name: foodName,
      serving: serving || '1 piece',
      carbs: 18,
      category: 'Grain',
      note: 'Fallback estimate for bread-like items.',
    }
  }

  if (lowered.includes('apple') || lowered.includes('banana') || lowered.includes('orange')) {
    return {
      name: foodName,
      serving: serving || '1 medium piece',
      carbs: 25,
      category: 'Fruit',
      note: 'Fallback estimate for medium fruit.',
    }
  }

  return {
    name: foodName,
    serving: serving || '1 serving',
    carbs: 20,
    category: 'Custom',
    note: 'Approximate fallback estimate. Check a nutrition label or trusted carb resource before using it for dosing.',
  }
}

function parseJsonObject(content: string) {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The AI response did not include a JSON object.')
  }

  return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>
}

function clampNumber(value: unknown) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return Math.round(parsed * 10) / 10
}

function readMessageContent(content: string | null | undefined) {
  if (typeof content === 'string' && content.trim()) {
    return content.trim()
  }

  throw new Error('The AI response did not include text.')
}

function formatAiWarning(error: unknown) {
  const message = error instanceof Error ? error.message : 'AI request failed.'

  if (message.includes('429')) {
    return 'OpenRouter rejected the request because the account is out of credit, rate-limited, or blocked.'
  }

  if (message.includes('401')) {
    return 'OpenRouter rejected the configured API key.'
  }

  return message
}

function normalizeOpenRouterKey(value: string) {
  if (!value) {
    return ''
  }

  return value.startsWith('sk-or-') ? value : `sk-or-${value}`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApiServer()
}

function loadEnvFiles() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(path.dirname(process.execPath), '.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'),
  ]

  candidates
    .filter((filePath, index, list) => list.indexOf(filePath) === index)
    .forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        dotenv.config({ path: filePath, override: false })
      }
    })
}
