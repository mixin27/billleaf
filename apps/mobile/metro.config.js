// Expo's Metro config detects the pnpm monorepo (watch folders, workspace
// packages) on its own.
const { getDefaultConfig } = require("expo/metro-config")

module.exports = getDefaultConfig(__dirname)
