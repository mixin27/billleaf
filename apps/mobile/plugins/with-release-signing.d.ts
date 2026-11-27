import type { ConfigPlugin } from "expo/config-plugins"

declare const withReleaseSigning: ConfigPlugin
export default withReleaseSigning
/** Adds the upload-key release signing config to app/build.gradle. */
export function applySigning(gradle: string): string
