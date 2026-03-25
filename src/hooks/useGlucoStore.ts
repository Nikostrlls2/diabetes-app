import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  AccountProfile,
  CarbEntry,
  CoachMessage,
  ConsentSettings,
  FoodItem,
  FoodSource,
  GlucoseReading,
  ProfileSettings,
  Reminder,
  SupplyItem,
} from '../types'

interface FoodDraft {
  name: string
  serving: string
  carbs: number
  category: string
  source?: FoodSource
  notes?: string
}

interface CarbEntryDraft {
  foodName: string
  serving: string
  carbs: number
  servings: number
  source: FoodSource
  note?: string
}

interface ReminderDraft {
  title: string
  time: string
  repeat: Reminder['repeat']
  kind: Reminder['kind']
  enabled?: boolean
}

interface GlucoseDraft {
  value: number
  context: string
  note?: string
}

interface GlucoStoreState {
  account: AccountProfile
  consent: ConsentSettings
  customFoods: FoodItem[]
  carbEntries: CarbEntry[]
  reminders: Reminder[]
  coachMessages: CoachMessage[]
  glucoseReadings: GlucoseReading[]
  supplyItems: SupplyItem[]
  settings: ProfileSettings
  addFood: (draft: FoodDraft) => FoodItem
  addCarbEntry: (draft: CarbEntryDraft) => void
  addReminder: (draft: ReminderDraft) => void
  toggleReminder: (id: string) => void
  deleteReminder: (id: string) => void
  markReminderFired: (id: string, slot: string) => void
  addCoachMessage: (message: CoachMessage) => void
  clearCoachMessages: () => void
  addGlucoseReading: (draft: GlucoseDraft) => void
  toggleSupplyItem: (id: string) => void
  resetSupplyItems: () => void
  updateSettings: (next: Partial<ProfileSettings>) => void
  updateAccount: (next: Partial<AccountProfile>) => void
  updateConsent: (next: Partial<ConsentSettings>) => void
  resetAllData: () => void
}

const defaultCoachCopy =
  'Ask about meals, planning, reminders, or how to think through carb-heavy foods. This app can help with daily organization, but dosing decisions still belong to your own care plan and clinician guidance.'

const defaultSupplyItems: SupplyItem[] = [
  { id: 'tabs', label: 'Fast carbs or glucose tabs', packed: true },
  { id: 'meter', label: 'Meter or CGM backup plan', packed: false },
  { id: 'snacks', label: 'Longer-acting snack', packed: false },
  { id: 'supplies', label: 'Pump or pen backup supplies', packed: false },
  { id: 'ketones', label: 'Ketone strips', packed: false },
  { id: 'charger', label: 'Phone or device charger', packed: false },
]

const defaultSettings: ProfileSettings = {
  lowTarget: 70,
  highTarget: 180,
  quickCarbGrams: 15,
}

const defaultConsent: ConsentSettings = {
  completedGettingStarted: false,
  acceptedMedicalDisclaimer: false,
  acceptedLocalStorage: false,
  allowAiSharing: false,
}

const defaultAccount: AccountProfile = {
  displayName: '',
  email: '',
  diagnosisYear: '',
  therapy: '',
  notes: '',
  createdAt: new Date().toISOString(),
}

export const useGlucoStore = create<GlucoStoreState>()(
  persist(
    (set) => ({
      account: defaultAccount,
      consent: defaultConsent,
      customFoods: [],
      carbEntries: [],
      reminders: [],
      coachMessages: [createCoachMessage('assistant', defaultCoachCopy)],
      glucoseReadings: [],
      supplyItems: defaultSupplyItems,
      settings: defaultSettings,
      addFood: (draft) => {
        const nextFood: FoodItem = {
          id: createId(),
          name: draft.name.trim(),
          serving: draft.serving.trim(),
          carbs: draft.carbs,
          category: draft.category.trim(),
          source: draft.source ?? 'custom',
          notes: draft.notes?.trim() || undefined,
          createdAt: new Date().toISOString(),
        }

        set((state) => {
          const dedupedFoods = state.customFoods.filter(
            (food) =>
              !(
                food.name.toLowerCase() === nextFood.name.toLowerCase() &&
                food.serving.toLowerCase() === nextFood.serving.toLowerCase()
              ),
          )

          return {
            customFoods: [nextFood, ...dedupedFoods],
          }
        })

        return nextFood
      },
      addCarbEntry: (draft) => {
        set((state) => ({
          carbEntries: [
            {
              id: createId(),
              createdAt: new Date().toISOString(),
              ...draft,
            },
            ...state.carbEntries,
          ],
        }))
      },
      addReminder: (draft) => {
        set((state) => ({
          reminders: [
            {
              id: createId(),
              createdAt: new Date().toISOString(),
              enabled: draft.enabled ?? true,
              ...draft,
            },
            ...state.reminders,
          ],
        }))
      },
      toggleReminder: (id) => {
        set((state) => ({
          reminders: state.reminders.map((reminder) =>
            reminder.id === id
              ? {
                  ...reminder,
                  enabled: !reminder.enabled,
                }
              : reminder,
          ),
        }))
      },
      deleteReminder: (id) => {
        set((state) => ({
          reminders: state.reminders.filter((reminder) => reminder.id !== id),
        }))
      },
      markReminderFired: (id, slot) => {
        set((state) => ({
          reminders: state.reminders.map((reminder) =>
            reminder.id === id
              ? {
                  ...reminder,
                  lastTriggeredSlot: slot,
                }
              : reminder,
          ),
        }))
      },
      addCoachMessage: (message) => {
        set((state) => ({
          coachMessages: [...state.coachMessages, message],
        }))
      },
      clearCoachMessages: () => {
        set({
          coachMessages: [createCoachMessage('assistant', defaultCoachCopy)],
        })
      },
      addGlucoseReading: (draft) => {
        set((state) => ({
          glucoseReadings: [
            {
              id: createId(),
              createdAt: new Date().toISOString(),
              ...draft,
            },
            ...state.glucoseReadings,
          ],
        }))
      },
      toggleSupplyItem: (id) => {
        set((state) => ({
          supplyItems: state.supplyItems.map((item) =>
            item.id === id
              ? {
                  ...item,
                  packed: !item.packed,
                }
              : item,
          ),
        }))
      },
      resetSupplyItems: () => {
        set({
          supplyItems: defaultSupplyItems,
        })
      },
      updateSettings: (next) => {
        set((state) => ({
          settings: {
            ...state.settings,
            ...next,
          },
        }))
      },
      updateAccount: (next) => {
        set((state) => ({
          account: {
            ...state.account,
            ...next,
          },
        }))
      },
      updateConsent: (next) => {
        set((state) => ({
          consent: {
            ...state.consent,
            ...next,
          },
        }))
      },
      resetAllData: () => {
        set({
          account: {
            ...defaultAccount,
            createdAt: new Date().toISOString(),
          },
          consent: defaultConsent,
          customFoods: [],
          carbEntries: [],
          reminders: [],
          coachMessages: [createCoachMessage('assistant', defaultCoachCopy)],
          glucoseReadings: [],
          supplyItems: defaultSupplyItems,
          settings: defaultSettings,
        })
      },
    }),
    {
      name: 'glucopilot-storage',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const saved = persisted as Partial<GlucoStoreState>

        return {
          ...current,
          ...saved,
          account: {
            ...current.account,
            ...(saved.account ?? {}),
          },
          consent: {
            ...current.consent,
            ...(saved.consent ?? {}),
          },
          settings: {
            ...current.settings,
            ...(saved.settings ?? {}),
          },
        }
      },
      partialize: (state) => ({
        account: state.account,
        consent: state.consent,
        customFoods: state.customFoods,
        carbEntries: state.carbEntries,
        reminders: state.reminders,
        coachMessages: state.coachMessages,
        glucoseReadings: state.glucoseReadings,
        supplyItems: state.supplyItems,
        settings: state.settings,
      }),
    },
  ),
)

function createCoachMessage(role: CoachMessage['role'], content: string): CoachMessage {
  return {
    id: createId(),
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
