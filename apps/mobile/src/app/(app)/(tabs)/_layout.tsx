import { NativeTabs } from "expo-router/native-tabs"

import { useMe } from "@/features/me"
import { canTrackTime } from "@/features/time"
import { useTheme } from "@/hooks/use-theme"

/**
 * Home, Time, Invoices and Expenses. Time is hidden without time tracking
 * (plan or role), Invoices without `invoice.read`, Expenses without
 * `expense.read`.
 */
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
      <NativeTabs.Trigger
        name="invoices"
        hidden={!me.data?.permissions.includes("invoice.read")}
      >
        <NativeTabs.Trigger.Label>Invoices</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "doc.text", selected: "doc.text.fill" }}
          md="description"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="expenses"
        hidden={!me.data?.permissions.includes("expense.read")}
      >
        <NativeTabs.Trigger.Label>Expenses</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "receipt", selected: "receipt.fill" }}
          md="receipt_long"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
