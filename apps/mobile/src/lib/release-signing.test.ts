import { describe, expect, it } from "vitest"

import { applySigning } from "../../plugins/with-release-signing.js"

// The shape of the Expo template's android/app/build.gradle.
const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`

describe("with-release-signing", () => {
  it("adds a release signing config and uses it when the key is configured", () => {
    const out = applySigning(GRADLE)
    expect(out).toContain("storeFile file(BILLLEAF_UPLOAD_STORE_FILE)")
    expect(out).toContain(
      "signingConfig project.hasProperty('BILLLEAF_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
    )
    // The debug build type keeps the debug key.
    expect(out).toMatch(/debug \{\n\s+signingConfig signingConfigs\.debug\n/)
  })

  it("is idempotent", () => {
    const once = applySigning(GRADLE)
    expect(applySigning(once)).toBe(once)
  })

  it("fails loudly when the template changes", () => {
    expect(() => applySigning("android {}")).toThrow(/no longer matches/)
  })
})
