import type { TimeEntry } from "@workspace/contracts"
import * as Notifications from "expo-notifications"
import { Platform } from "react-native"

import { reminderAt, reminderBody } from "@/lib/reminder-schedule"

const ID = "running-timer"
const CHANNEL = "timer"
export const STOP_ACTION = "stop"

export type ReminderData = {
  entryId: string
  workspace: { id: string; slug: string; name: string }
}

// Show it even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

let ready: Promise<void> | null = null
/** The Android channel and the "Stop timer" button, set up once. */
function setUp() {
  ready ??= (async () => {
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Timer reminders",
        description: "When a timer has been running for a long time",
        importance: Notifications.AndroidImportance.HIGH,
      })
    await Notifications.setNotificationCategoryAsync(ID, [
      {
        identifier: STOP_ACTION,
        buttonTitle: "Stop timer",
        // Stopping needs the app (and its session), so open it.
        options: { opensAppToForeground: true },
      },
    ])
  })().catch((e) => {
    ready = null
    throw e
  })
  return ready
}

/** Ask once; after a "no" we stay quiet (the OS won't ask again). */
async function allowed() {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  return (await Notifications.requestPermissionsAsync()).granted
}

export function cancelTimerReminder() {
  return Notifications.cancelScheduledNotificationAsync(ID).catch(() => {})
}

/**
 * One reminder at most, for the running timer in the active workspace:
 * replaced when the timer changes, removed when it stops. A timer that's
 * already past the mark gets none (you're looking at it).
 */
export async function syncTimerReminder(
  entry: TimeEntry | null,
  workspace: ReminderData["workspace"]
) {
  await cancelTimerReminder()
  const at = entry && reminderAt(entry)
  if (!at || at <= Date.now() + 5_000) return
  if (!(await allowed())) return
  await setUp()
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: {
      title: "Is your timer still running?",
      body: reminderBody(entry),
      data: { entryId: entry.id, workspace } satisfies ReminderData,
      categoryIdentifier: ID,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL,
    },
  })
}
