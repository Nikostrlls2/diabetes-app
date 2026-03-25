import { addDays, format, isAfter, startOfDay } from 'date-fns'
import type { Reminder } from '../types'

interface NextReminder {
  reminder: Reminder
  when: Date
}

export function formatRepeatLabel(repeat: Reminder['repeat']) {
  if (repeat === 'weekdays') {
    return 'Weekdays'
  }

  if (repeat === 'weekends') {
    return 'Weekends'
  }

  return 'Every day'
}

export function shouldTriggerReminder(reminder: Reminder, now: Date) {
  if (!reminder.enabled) {
    return false
  }

  const [hours, minutes] = reminder.time.split(':').map(Number)
  const slot = buildReminderSlot(now, reminder.time)

  return (
    hours === now.getHours() &&
    minutes === now.getMinutes() &&
    reminderMatchesDay(reminder, now) &&
    reminder.lastTriggeredSlot !== slot
  )
}

export function buildReminderSlot(date: Date, time: string) {
  return `${format(date, 'yyyy-MM-dd')}-${time}`
}

export function getNextReminder(reminders: Reminder[], now = new Date()): NextReminder | null {
  const active = reminders.filter((reminder) => reminder.enabled)
  let best: NextReminder | null = null

  for (const reminder of active) {
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(startOfDay(now), offset)
      if (!reminderMatchesDay(reminder, date)) {
        continue
      }

      const [hours, minutes] = reminder.time.split(':').map(Number)
      const candidate = new Date(date)
      candidate.setHours(hours, minutes, 0, 0)

      if (offset === 0 && !isAfter(candidate, now) && candidate.getTime() !== now.getTime()) {
        continue
      }

      if (!best || candidate.getTime() < best.when.getTime()) {
        best = { reminder, when: candidate }
      }

      break
    }
  }

  return best
}

function reminderMatchesDay(reminder: Reminder, date: Date) {
  const day = date.getDay()

  if (reminder.repeat === 'daily') {
    return true
  }

  if (reminder.repeat === 'weekdays') {
    return day >= 1 && day <= 5
  }

  return day === 0 || day === 6
}
