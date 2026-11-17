import { Platform } from "react-native"

/**
 * Where the app reaches Billleaf. Set EXPO_PUBLIC_API_URL / _WEB_URL for a
 * real phone or a deployed server; the defaults are the local dev stack
 * (`pnpm dev`) as seen from the iOS simulator or the Android emulator.
 */
const host = Platform.OS === "android" ? "10.0.2.2" : "localhost"

export const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${host}:4000`
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || `http://${host}:3000`

/** Must match the server's trusted app origin (MOBILE_APP_ORIGIN). */
export const APP_SCHEME = "billleaf"
