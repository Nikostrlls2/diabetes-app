export type AppTab = 'start' | 'overview' | 'foods' | 'coach' | 'reminders' | 'reports' | 'account'
export type FoodSource = 'seed' | 'custom' | 'ai'
export type ReminderKind = 'glucose' | 'insulin' | 'meal' | 'hydration'
export type ReminderRepeat = 'daily' | 'weekdays' | 'weekends'

export interface FoodItem {
  id: string
  name: string
  serving: string
  carbs: number
  category: string
  source: FoodSource
  createdAt: string
  notes?: string
}

export interface CarbEntry {
  id: string
  foodName: string
  serving: string
  carbs: number
  servings: number
  source: FoodSource
  note?: string
  createdAt: string
}

export interface Reminder {
  id: string
  title: string
  time: string
  repeat: ReminderRepeat
  kind: ReminderKind
  enabled: boolean
  createdAt: string
  lastTriggeredSlot?: string
}

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface GlucoseReading {
  id: string
  value: number
  context: string
  note?: string
  createdAt: string
}

export interface SupplyItem {
  id: string
  label: string
  packed: boolean
}

export interface ProfileSettings {
  lowTarget: number
  highTarget: number
  quickCarbGrams: number
}

export interface ConsentSettings {
  completedGettingStarted: boolean
  acceptedMedicalDisclaimer: boolean
  acceptedLocalStorage: boolean
  allowAiSharing: boolean
}

export interface AccountProfile {
  displayName: string
  email: string
  diagnosisYear: string
  therapy: string
  notes: string
  createdAt: string
}

export interface FoodEstimateResponse {
  name: string
  serving: string
  carbs: number
  category: string
  note: string
  source: 'reference' | 'openrouter' | 'fallback'
  warning?: string
}

export interface CoachResponse {
  answer: string
  source: 'openrouter' | 'fallback'
  warning?: string
}
