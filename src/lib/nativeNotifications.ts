import { Capacitor } from '@capacitor/core'
import {
  LocalNotifications,
  Weekday,
  type LocalNotificationDescriptor,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications'
import type { Reminder } from '../types'

const CHANNEL_ID = 'glucopilot-reminders'

export function supportsNativeNotifications() {
  return Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios'
}

export async function getNativeNotificationPermission() {
  if (!supportsNativeNotifications()) {
    return 'unsupported' as const
  }

  const permission = await LocalNotifications.checkPermissions()
  return mapPermissionState(permission.display)
}

export async function requestNativeNotificationPermission() {
  if (!supportsNativeNotifications()) {
    return 'unsupported' as const
  }

  let permission = await LocalNotifications.checkPermissions()

  if (permission.display !== 'granted') {
    permission = await LocalNotifications.requestPermissions()
  }

  if (permission.display === 'granted') {
    await ensureReminderChannel()
  }

  return mapPermissionState(permission.display)
}

export async function syncNativeReminderNotifications(reminders: Reminder[]) {
  if (!supportsNativeNotifications()) {
    return
  }

  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    return
  }

  await ensureReminderChannel()
  await clearPendingReminderNotifications()

  const notifications = buildReminderNotifications(reminders)
  if (!notifications.length) {
    return
  }

  await LocalNotifications.schedule({ notifications })
}

export async function listenForNativeReminderEvents(onReceive: (message: string) => void): Promise<() => void> {
  if (!supportsNativeNotifications()) {
    return () => {}
  }

  const handle = await LocalNotifications.addListener('localNotificationReceived', (notification) => {
    onReceive(notification.body || notification.title)
  })

  return () => {
    void handle.remove()
  }
}

function buildReminderNotifications(reminders: Reminder[]) {
  return reminders
    .filter((reminder) => reminder.enabled)
    .flatMap((reminder) => {
      const [hours, minutes] = reminder.time.split(':').map(Number)
      const weekdays =
        reminder.repeat === 'daily'
          ? [null]
          : reminder.repeat === 'weekdays'
            ? [Weekday.Monday, Weekday.Tuesday, Weekday.Wednesday, Weekday.Thursday, Weekday.Friday]
            : [Weekday.Saturday, Weekday.Sunday]

      return weekdays.map((weekday, index) => {
        const notification: LocalNotificationSchema = {
          id: buildNotificationId(reminder.id, index),
          title: 'GlucoPilot reminder',
          body: reminder.title,
          channelId: CHANNEL_ID,
          schedule: {
            on: {
              ...(weekday ? { weekday } : {}),
              hour: hours,
              minute: minutes,
            },
            repeats: true,
            allowWhileIdle: true,
          },
        }

        return notification
      })
    })
}

async function ensureReminderChannel() {
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Reminders',
      description: 'Glucose, meal, hydration, and routine reminders',
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
    })
  } catch {
    // Channel creation can fail if it already exists.
  }
}

async function clearPendingReminderNotifications() {
  const pending = await LocalNotifications.getPending()
  if (!pending.notifications.length) {
    return
  }

  const notifications: LocalNotificationDescriptor[] = pending.notifications.map((notification) => ({
    id: notification.id,
  }))

  await LocalNotifications.cancel({ notifications })
}

function buildNotificationId(reminderId: string, offset: number) {
  let hash = 0

  for (const char of `${reminderId}-${offset}`) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147000000
  }

  return 100000 + hash
}

function mapPermissionState(state: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied') {
  if (state === 'granted') {
    return 'granted' as const
  }

  if (state === 'denied') {
    return 'denied' as const
  }

  return 'default' as const
}
