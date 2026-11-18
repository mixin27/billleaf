import { NativeTabs } from "expo-router/native-tabs"

import { useMe } from "@/features/me"
import { canTrackTime } from "@/features/time"
import { useTheme } from "@/hooks/use-theme"

/** Home and Time. Time is hidden when the plan or your role has no time tracking. */
export default function TabsLayout() {
  const t = useTheme()
  const me = useMe()
  return (
    <NativeTabs tintColor={t.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="time" hidden={!canTrackTime(me.data)}>
        <NativeTabs.Trigger.Label>Time</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "timer", selected: "timer" }}
          md="timer"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
