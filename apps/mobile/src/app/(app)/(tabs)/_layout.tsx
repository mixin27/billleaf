import { Tabs } from "expo-router/js-tabs"

import { TabBar } from "@/components/nav/tab-bar"
import { useBreakpoint } from "@/hooks/use-breakpoint"
import { useTheme } from "@/hooks/use-theme"

/**
 * The tabs, drawn by our own TabBar (bottom bar with the timer dock on
 * phones, a side rail on tablets). Which tabs show is `navSlotsFor` in
 * src/lib/nav.ts; the rest (Invoices, Clients on a phone) open from More.
 * Screens check their own permissions.
 */
export default function TabsLayout() {
  const t = useTheme()
  const bp = useBreakpoint()
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      // Android back goes to the tab you came from, then Home, then exits.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarPosition: bp === "compact" ? "bottom" : "left",
        sceneStyle: { backgroundColor: t.canvas },
        animation: "fade",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="expenses" options={{ title: "Money" }} />
      <Tabs.Screen name="time" options={{ title: "Time" }} />
      <Tabs.Screen name="invoices" options={{ title: "Invoices" }} />
      <Tabs.Screen name="clients" options={{ title: "Clients" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  )
}
