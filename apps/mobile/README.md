# Billleaf mobile (Expo)

iOS and Android app, Expo **SDK 58** (React Native 0.88.1, React 19.3.0), expo-router, scaffolded with the official `create-expo-app` (default template, demo removed). Decisions: [ADR-0017](../../docs/adr/0017-mobile-app-expo-native-auth.md).

## Run it

```bash
pnpm infra:up && pnpm dev            # API :4000 and web :3000 (from the repo root)
pnpm --filter mobile ios              # build and open in the iOS simulator (Xcode)
pnpm --filter mobile android          # Android emulator (Android Studio)
pnpm --filter mobile start            # Metro only, once the app is installed
```

The first `ios` run generates `ios/` (gitignored), installs CocoaPods and builds with Xcode; later runs are quick. Sign in with an account made on the web (sign-up and email verification stay on the web).

- The simulator reaches your Mac at `localhost`; the Android emulator at `10.0.2.2`. For a real phone, set `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEB_URL` in `.env` to your computer's LAN address (see `.env.example`).
- These are debug builds (Metro serves the JS). Expo Go isn't used: the app's scheme is `billleaf://`, which the API trusts; Expo Go would need `exp://**` in the API's `TRUSTED_ORIGINS`.
- `expo-dev-client` isn't installed: its 58.0.x launcher doesn't compile with Xcode 27.0 (`axisBehavior` is missing from the iOS 27.0 SDK). Add it back once a fixed release is out.

## How it talks to the API

- `src/lib/auth-client.ts`: Better Auth with `@better-auth/expo/client`. The session cookie is stored in the keychain (expo-secure-store) and sent with `expo-origin: billleaf://`.
- `src/lib/api.ts`: the shared typed client (`@workspace/api-client`) with `credentials: "omit"`, the stored `Cookie`, and `X-Workspace-Id`. `ApiError` / `unwrap` / `errorMessage` match the web app.
- `src/stores/workspace-store.ts`: the active workspace (zustand, persisted in SecureStore). `app/(app)/_layout.tsx` checks it against your memberships on launch and sends you to the picker without one.
- `src/features/*`: TanStack Query hooks per screen (workspaces, `/v1/me`, dashboard, time). Query keys include the workspace id; `features/time.ts` uses the web's `timeKeys` shape.
- `src/app/(app)/(tabs)`: native tabs (Home, Time). `project-picker.tsx` is a modal that sets the running timer's project, or the next one's via `stores/timer-draft.ts`.
- Expenses: `src/lib/receipt-photo.ts` takes or picks a photo (`expo-image-picker`) and re-saves it as a JPEG of at most 2000px (`expo-image-manipulator`; iPhones shoot HEIC, which the API rejects). `features/expenses.ts` creates the expense, then PUTs the photo as multipart with `fetch` and `apiHeaders()`. Expo's fetch only takes Blob-like parts, so the photo goes in as an `expo-file-system` `File` (React Native's `{ uri, name, type }` parts fail with "Unsupported FormDataPart implementation"). `lib/amount.ts` reads a decimal-pad comma as the decimal point.
- Date and time-zone helpers (`weekStart`, `addDays`, `parseDuration`, `zonedParts`, `zonedToUtc`, `hhmm`, `parseHhmm`) come from `@workspace/contracts` (`common/dates.ts`), shared with the web.
- `app/(app)/entry-edit.tsx`: edit or delete a Today entry. There's no single-entry GET, so it reads the entry from the cached time list (`useCachedEntry`).
- Tests: `pnpm --filter mobile test` (Vitest) covers the pure modules in `src/lib` only (`clock`, `amount`, `api-error`); no React Native runtime.
- `src/lib/session.ts`: `signOut()` clears the session, the workspace and the query cache.
- `src/lib/query-client.ts`: TanStack Query; refetches when the app returns to the foreground.

## Layout

| Path                     | What                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `src/app`                | Routes (expo-router). `sign-in` when signed out, `(app)/…` when signed in (`Stack.Protected`). |
| `src/components/ui.tsx`  | Themed building blocks: `Screen`, `Title`, `Body`, `Field`, `Button`.                          |
| `src/constants/theme.ts` | Brand colours (light/dark), spacing, radius, type. Plain `StyleSheet`, no styling library.     |
| `src/lib`                | Config, auth, API and query clients.                                                           |

Brand icon and splash come from `packages/brand/assets` (see `app.json`).

## Checks

CI runs `lint` and `typecheck` (no `build` or `dev` script, so `turbo build` and `pnpm dev` skip the app). Run them with `pnpm --filter mobile lint` / `typecheck`.
