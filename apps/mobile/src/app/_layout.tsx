import { QueryClientProvider } from "@tanstack/react-query"
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { StatusBar } from "expo-status-bar"
import * as React from "react"

import { Colors } from "@/constants/theme"
import { useColorScheme } from "@/hooks/use-color-scheme"
import { authClient } from "@/lib/auth-client"
import { queryClient } from "@/lib/query-client"

SplashScreen.preventAutoHideAsync()

/** Signed out → sign-in; signed in → the app. Splash stays until we know. */
export default function RootLayout() {
  const scheme = useColorScheme()
  const session = authClient.useSession()
  const signedIn = Boolean(session.data?.session)

  React.useEffect(() => {
    if (!session.isPending) SplashScreen.hideAsync()
  }, [session.isPending])
  if (session.isPending) return null

  const base = scheme === "dark" ? DarkTheme : DefaultTheme
  const c = Colors[scheme === "dark" ? "dark" : "light"]
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        value={{
          ...base,
          colors: {
            ...base.colors,
            primary: c.primary,
            background: c.background,
            card: c.background,
            text: c.text,
            border: c.border,
          },
        }}
      >
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
