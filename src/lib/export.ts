import type { CarbEntry, FoodItem, GlucoseReading, ProfileSettings, Reminder, SupplyItem } from '../types'

interface ExportSnapshot {
  exportedAt: string
  foods: FoodItem[]
  carbEntries: CarbEntry[]
  reminders: Reminder[]
  glucoseReadings: GlucoseReading[]
  supplyItems: SupplyItem[]
  settings: ProfileSettings
}

export function downloadJsonSnapshot(snapshot: ExportSnapshot) {
  downloadJsonFile(
    `glucopilot-export-${new Date().toISOString().slice(0, 10)}.json`,
    snapshot,
  )
}

export function downloadJsonFile(name: string, data: unknown) {
  downloadFile(name, JSON.stringify(data, null, 2), 'application/json')
}

export function downloadCarbCsv(entries: CarbEntry[]) {
  const rows = [
    ['createdAt', 'foodName', 'serving', 'carbsPerServing', 'servings', 'totalCarbs', 'source', 'note'],
    ...entries.map((entry) => [
      entry.createdAt,
      escapeValue(entry.foodName),
      escapeValue(entry.serving),
      String(entry.carbs),
      String(entry.servings),
      String(entry.carbs * entry.servings),
      entry.source,
      escapeValue(entry.note ?? ''),
    ]),
  ]

  downloadFile(
    `glucopilot-carb-log-${new Date().toISOString().slice(0, 10)}.csv`,
    rows.map((row) => row.join(',')).join('\n'),
    'text/csv;charset=utf-8',
  )
}

function escapeValue(value: string) {
  const escaped = value.replaceAll('"', '""')
  return `"${escaped}"`
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
