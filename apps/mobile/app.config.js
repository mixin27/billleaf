// app.json, plus Firebase's google-services.json for Android push when
// there is one: the gitignored file in this folder, or on EAS Build the
// GOOGLE_SERVICES_JSON file variable. Without it the app still builds; it
// just can't get a push token on Android. (Plain JS like metro.config.js:
// it runs in Node, outside the app's TypeScript and lint setup.)
const fs = require("node:fs")
const path = require("node:path")

/** @param {import("expo/config").ConfigContext} ctx */
module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json")
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (fs.existsSync(local) ? "./google-services.json" : undefined)
  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  }
}
