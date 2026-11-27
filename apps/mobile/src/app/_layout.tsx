import { QueryClientProvider } from "@tanstack/react-query"
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router"
import * as ScreenOrientation from "expo-screen-orientation"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import * as React from "react"
import { Dimensions, StyleSheet } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import { FeedbackHost } from "@/components/ui"
import { Colors } from "@/constants/theme"
import { useColorScheme } from "@/hooks/use-color-scheme"
import { authClient } from "@/lib/auth-client"
import { queryClient } from "@/lib/query-client"

SplashScreen.preventAutoHideAsync()

// Phones stay portrait; tablets (shortest side 600+) rotate.
{
  const { width, height } = Dimensions.get("screen")
  if (Math.min(width, height) < 600)
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {})
}

/** Signed out → sign-in; signed in → the app. Splash stays until we know. */
export default function RootLayout() {
  const scheme = useColorScheme()
  const session = authClient.useSession()
  const signedIn = Boolean(session.data?.session)
  // Only the first check holds the splash. Later re-checks (Better Auth
  // refetches after every sign-in call) report `isPending` again while
  // signed out; blanking the app then unmounted the sign-in screen and
  // dropped its two-factor code step, so 2FA accounts looped back to the
  // password form.
  const [ready, setReady] = React.useState(false)
  if (!ready && !session.isPending) setReady(true)

  React.useEffect(() => {
    if (ready) SplashScreen.hideAsync()
  }, [ready])
  if (!ready) return null

  const base = scheme === "dark" ? DarkTheme : DefaultTheme
  const c = Colors[scheme === "dark" ? "dark" : "light"]
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          value={{
            ...base,
            colors: {
              ...base.colors,
              primary: c.primary,
              background: c.canvas,
              card: c.surface,
              text: c.text,
              border: c.border,
            },
          }}
        >
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="sign-in" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
          </Stack>
          <FeedbackHost />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
