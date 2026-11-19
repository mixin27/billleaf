import type { TimeEntry } from "@workspace/contracts"
import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import { Alert, Platform } from "react-native"

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

const ASKED_EXACT = "billleaf.exact-alarm-asked"

/**
 * Android 12+ may deliver an inexact alarm up to 3/4 of the wait late:
 * hours, for an 8-hour reminder. Exact alarms need "Alarms & reminders",
 * which is off by default from Android 14, so ask once (with a reason)
 * and otherwise make do with the late one.
 */
async function askForExactAlarms() {
  if (Platform.OS !== "android") return
  if ((await Notifications.getExactAlarmPermissionsAsync()).granted) return
  if (await SecureStore.getItemAsync(ASKED_EXACT)) return
  await SecureStore.setItemAsync(ASKED_EXACT, "1")
  const open = await new Promise<boolean>((resolve) =>
    Alert.alert(
      "Get timer reminders on time?",
      "Without permission to set alarms, Android can show Billleaf's reminder hours late. On the next screen, turn on “Allow setting alarms and reminders”.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Open settings", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  )
  // Resolves when you come back from the settings screen.
  if (open) await Notifications.requestExactAlarmPermissionsAsync()
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
  // The channel first: Android 13+ only shows the permission prompt once
  // the app has a notification channel.
  await setUp()
  if (!(await allowed())) return
  await askForExactAlarms().catch(() => {})
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
