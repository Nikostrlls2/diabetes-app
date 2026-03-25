import type { CoachResponse, FoodEstimateResponse } from '../types'
import { apiUrl } from './api'

const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions'
const openRouterModel = import.meta.env.VITE_OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini'
const openRouterApiKey = normalizeOpenRouterKey(import.meta.env.VITE_OPENROUTER_API_KEY?.trim() || '')
const openRouterReferer = 'https://glucopilot.app'
const openRouterTitle = 'GlucoPilot'

const coachInstructions =
  'You are a calm assistant inside a type 1 diabetes support app. Give short, practical education and planning help. Do not prescribe insulin doses, do not replace a clinician, and tell the user to seek urgent medical help for severe low blood sugar, breathing trouble, vomiting, confusion, or ketones with high glucose.'

const foodEstimateInstructions =
  'Estimate typical carbohydrate grams for food serving sizes in a type 1 diabetes support app. Return valid JSON only. Do not include markdown.'

interface AiRequestOptions {
  backendAvailable: boolean
  allowAiSharing: boolean
}

interface CoachRequestOptions extends AiRequestOptions {
  question: string
  summary: string
}

interface FoodEstimateRequestOptions extends AiRequestOptions {
  foodName: string
  serving: string
}

export async function requestCoachResponse({
  question,
  summary,
  backendAvailable,
  allowAiSharing,
}: CoachRequestOptions): Promise<CoachResponse> {
  if (!allowAiSharing) {
    return {
      answer: buildFallbackCoachReply(question),
      source: 'fallback',
      warning: 'Live AI is off. Enable AI sharing in Getting Started or Account before sending health questions to OpenRouter.',
    }
  }

  let warning = ''

  if (openRouterApiKey) {
    try {
      const answer = await requestOpenRouterText({
        instructions: coachInstructions,
        input: `User question: ${question}\n\nApp summary: ${summary || 'No summary provided.'}\n\nAnswer in plain language with 2 short paragraphs maximum.`,
      })

      return {
        answer,
        source: 'openrouter',
      }
    } catch (error) {
      warning = formatAiWarning(error)
    }
  } else {
    warning = 'The built-in OpenRouter key is missing from this build.'
  }

  if (backendAvailable) {
    try {
      const response = await fetch(apiUrl('/api/ai/coach'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, summary }),
      })
      const data = await readJsonResponse<CoachResponse>(response)

      if (data.source === 'openrouter') {
        return data
      }

      return {
        ...data,
        warning: warning || data.warning,
      }
    } catch (error) {
      if (!warning) {
        warning = formatAiWarning(error)
      }
    }
  }

  return {
    answer: buildFallbackCoachReply(question),
    source: 'fallback',
    warning: warning || 'Live AI is unavailable right now. The app will keep using local fallback answers.',
  }
}

export async function requestFoodEstimate({
  foodName,
  serving,
  backendAvailable,
  allowAiSharing,
}: FoodEstimateRequestOptions): Promise<FoodEstimateResponse> {
  if (!allowAiSharing) {
    return {
      ...estimateFoodHeuristic(foodName, serving),
      source: 'fallback',
      warning: 'Live AI is off. Enable AI sharing in Getting Started or Account before sending food questions to OpenRouter.',
    }
  }

  let warning = ''

  if (openRouterApiKey) {
    try {
      const content = await requestOpenRouterText({
        instructions: foodEstimateInstructions,
        input: `Estimate carbs for "${foodName}" with serving "${serving || '1 serving'}". Return JSON with keys: name, serving, carbs, category, note. carbs must be a number.`,
        expectJson: true,
      })
      const parsed = parseJsonObject(content)

      return {
        name: String(parsed.name ?? foodName),
        serving: String(parsed.serving ?? (serving || '1 serving')),
        carbs: clampNumber(parsed.carbs),
        category: String(parsed.category ?? 'Custom'),
        note: String(
          parsed.note ??
            'AI estimate. Please verify with a nutrition label or diabetes care team when accuracy matters.',
        ),
        source: 'openrouter',
      }
    } catch (error) {
      warning = formatAiWarning(error)
    }
  } else {
    warning = 'The built-in OpenRouter key is missing from this build.'
  }

  if (backendAvailable) {
    try {
      const response = await fetch(apiUrl('/api/foods/estimate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodName, serving }),
      })
      const data = await readJsonResponse<FoodEstimateResponse>(response)

      if (data.source === 'openrouter' || data.source === 'reference') {
        return data
      }

      return {
        ...data,
        warning: warning || data.warning,
      }
    } catch (error) {
      if (!warning) {
        warning = formatAiWarning(error)
      }
    }
  }

  return {
    ...estimateFoodHeuristic(foodName, serving),
    source: 'fallback',
    warning: warning || 'Live AI is unavailable right now. The app will keep using local fallback estimates.',
  }
}

async function requestOpenRouterText(body: {
  instructions: string
  input: string
  expectJson?: boolean
}) {
  const response = await fetch(openRouterUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': openRouterReferer,
      'X-OpenRouter-Title': openRouterTitle,
    },
    body: JSON.stringify({
      model: openRouterModel,
      temperature: body.expectJson ? 0.1 : 0.3,
      messages: [
        {
          role: 'system',
          content: body.instructions,
        },
        {
          role: 'user',
          content: body.input,
        },
      ],
      ...(body.expectJson ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(formatErrorMessage(response.status, payload))
  }

  return extractOutputText(payload)
}

async function readJsonResponse<T>(response: Response) {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(formatErrorMessage(response.status, payload))
  }

  return payload as T
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The AI response was empty.')
  }

  const choices = Reflect.get(payload, 'choices')
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('The AI response did not include any choices.')
  }

  const firstChoice = choices[0]
  if (!firstChoice || typeof firstChoice !== 'object') {
    throw new Error('The AI response was invalid.')
  }

  const message = Reflect.get(firstChoice, 'message')
  if (!message || typeof message !== 'object') {
    throw new Error('The AI response did not include a message.')
  }

  const content = Reflect.get(message, 'content')

  if (typeof content === 'string' && content.trim()) {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return ''
        }

        const value = Reflect.get(part, 'text')
        return typeof value === 'string' ? value : ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()

    if (text) {
      return text
    }
  }

  throw new Error('The AI response did not include text.')
}

function formatErrorMessage(status: number, payload: unknown) {
  if (payload && typeof payload === 'object') {
    const error = Reflect.get(payload, 'error')

    if (error && typeof error === 'object') {
      const message = Reflect.get(error, 'message')
      if (typeof message === 'string' && message.trim()) {
        return `${status} ${message.trim()}`
      }
    }

    const message = Reflect.get(payload, 'message')
    if (typeof message === 'string' && message.trim()) {
      return `${status} ${message.trim()}`
    }
  }

  return `${status} AI request failed.`
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

function formatAiWarning(error: unknown) {
  const message = error instanceof Error ? error.message : 'AI request failed.'

  if (message.includes('401')) {
    return 'OpenRouter rejected the built-in API key. Check the configured key and try again.'
  }

  if (message.includes('429')) {
    return 'OpenRouter rejected the request because the account is out of credit, rate-limited, or blocked.'
  }

  if (message.includes('402')) {
    return 'OpenRouter rejected the request because the account needs billing or credits.'
  }

  if (message.includes('403')) {
    return 'OpenRouter blocked the request. Check the account settings, provider settings, or app domain restrictions.'
  }

  if (message.includes('Failed to fetch')) {
    return 'The device could not reach OpenRouter. Check the internet connection and try again.'
  }

  return message
}

function normalizeOpenRouterKey(value: string) {
  if (!value) {
    return ''
  }

  return value.startsWith('sk-or-') ? value : `sk-or-${value}`
}
