import type { PushType } from "@workspace/contracts"
import Constants from "expo-constants"
import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

import { api, unwrap } from "@/lib/api"

/** The Android channel the API sends on (`channelId: "activity"`). */
const CHANNEL = "activity"
/** The token this phone registered, so sign-out can remove it. */
const STORED_TOKEN = "billleaf.push-token"

/** What a push from the API carries (see the API's `PushJob`). */
export type PushData = {
  type: PushType
  path: string | null
  workspace: { id: string; slug: string; name: string }
}

export function isPushData(data: unknown): data is PushData {
  const d = data as Partial<PushData> | null | undefined
  return Boolean(d && typeof d.type === "string" && d.workspace?.id)
}

/**
 * The Expo project this build belongs to (`eas init` writes it to
 * app.json). Without one there's no push token to get: the app still
 * works, it just can't receive pushes.
 */
export const PROJECT_ID: string | undefined =
  Constants.easConfig?.projectId ??
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
    ?.projectId

let channel: Promise<void> | null = null
/** Android 13+ only asks for permission once the app has a channel. */
function setUpChannel() {
  if (Platform.OS !== "android") return Promise.resolve()
  channel ??= Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Activity",
    description: "Clients accepting quotes, signing contracts and paying",
    importance: Notifications.AndroidImportance.DEFAULT,
  })
    .then(() => {})
    .catch((e) => {
      channel = null
      throw e
    })
  return channel
}

export type PushPermission = "granted" | "undetermined" | "denied"

export async function pushPermission(): Promise<PushPermission> {
  const p = await Notifications.getPermissionsAsync()
  if (p.granted) return "granted"
  return p.canAskAgain ? "undetermined" : "denied"
}

let registered: string | null = null

/**
 * Get this phone's push token and give it to Billleaf, so pushes for the
 * signed-in user reach it. With `ask`, shows the system prompt if it
 * hasn't been answered; without, does nothing unless already allowed.
 * Sends the token once per launch (the API refreshes `lastSeenAt`).
 */
export async function registerForPush({ ask = false } = {}): Promise<
  PushPermission | "unavailable"
> {
  await setUpChannel()
  let permission = await pushPermission()
  if (permission === "undetermined" && ask)
    permission = (await Notifications.requestPermissionsAsync()).granted
      ? "granted"
      : await pushPermission()
  if (permission !== "granted") return permission
  if (!PROJECT_ID) return "unavailable"

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: PROJECT_ID,
  })
  if (registered === token) return "granted"
  await unwrap(
    api.POST("/v1/me/push-devices", {
      body: {
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceName: Constants.deviceName?.slice(0, 100),
        appVersion: Constants.expoConfig?.version,
      },
    })
  )
  registered = token
  await SecureStore.setItemAsync(STORED_TOKEN, token)
  return "granted"
}

/**
 * Stop pushes to this phone: called on sign-out, before the session goes
 * (the route needs it). Never throws; a token the API can't remove now is
 * dropped the first time Expo reports the app gone, or rebound at the next
 * sign-in.
 */
export async function unregisterPush() {
  const token = registered ?? (await SecureStore.getItemAsync(STORED_TOKEN))
  registered = null
  if (!token) return
  try {
    await unwrap(
      api.DELETE("/v1/me/push-devices/{token}", {
        params: { path: { token } },
      })
    )
  } catch {
    // Offline or already gone.
  }
  await SecureStore.deleteItemAsync(STORED_TOKEN).catch(() => {})
}

/** The OS rotated the token: register the new one. */
export function onPushTokenChange() {
  const sub = Notifications.addPushTokenListener(() => {
    registered = null
    registerForPush().catch(() => {})
  })
  return () => sub.remove()
}
