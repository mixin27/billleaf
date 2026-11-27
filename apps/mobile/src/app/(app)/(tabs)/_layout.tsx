import { NativeTabs } from "expo-router/native-tabs"
import { Platform } from "react-native"

import { moneyPanes } from "@/features/cashbook"
import { useMe } from "@/features/me"
import { canTrackTime } from "@/features/time"
import { useTheme } from "@/hooks/use-theme"

/**
 * Android tab icons: Hugeicons, as on the web, rendered to PNGs by
 * `pnpm tab-icons` (scripts/tab-icons.mjs). iOS keeps SF Symbols.
 */
const ICONS = {
  home: require("../../../../assets/tab-icons/home.png"),
  time: require("../../../../assets/tab-icons/time.png"),
  invoices: require("../../../../assets/tab-icons/invoices.png"),
  clients: require("../../../../assets/tab-icons/clients.png"),
  money: require("../../../../assets/tab-icons/money.png"),
}

/**
 * Home, Time, Invoices, Clients and Expenses. Time is hidden without time
 * tracking (plan or role), Invoices (which holds quotes and contracts too)
 * without `invoice.read`, `quote.read` and `contract.read`, Clients (which
 * holds projects too) without `client.read` and `project.read`. Money
 * holds cashbooks and expenses, and is named after the one you can see
 * when it's only one.
 */
export default function TabsLayout() {
  const t = useTheme()
  const me = useMe()
  const canInvoices = me.data?.permissions.includes("invoice.read") ?? false
  const canQuotes = me.data?.permissions.includes("quote.read") ?? false
  const canContracts = me.data?.permissions.includes("contract.read") ?? false
  const canClients = me.data?.permissions.includes("client.read") ?? false
  const canProjects = me.data?.permissions.includes("project.read") ?? false
  const money = moneyPanes(me.data?.permissions)
  return (
    <NativeTabs
      tintColor={t.primary}
      labelVisibilityMode="labeled"
      // Android: brand colours instead of Material's lavender defaults. iOS
      // keeps its native (glass) bar and only takes the tint.
      {...(Platform.OS === "android"
        ? {
            backgroundColor: t.tabBar,
            indicatorColor: t.tabIndicator,
            rippleColor: t.backgroundSelected,
            iconColor: { default: t.textSecondary, selected: t.primary },
            labelStyle: {
              default: { color: t.textSecondary, fontSize: 12 },
              selected: { color: t.primary, fontSize: 12, fontWeight: "600" },
            },
            badgeBackgroundColor: t.primary,
            badgeTextColor: t.onPrimary,
          }
        : {})}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          src={ICONS.home}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="time" hidden={!canTrackTime(me.data)}>
        <NativeTabs.Trigger.Label>Time</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "timer", selected: "timer" }}
          src={ICONS.time}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="invoices"
        hidden={!canInvoices && !canQuotes && !canContracts}
      >
        <NativeTabs.Trigger.Label>
          {canInvoices ? "Invoices" : canQuotes ? "Quotes" : "Contracts"}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "doc.text", selected: "doc.text.fill" }}
          src={ICONS.invoices}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clients" hidden={!canClients && !canProjects}>
        <NativeTabs.Trigger.Label>
          {canClients ? "Clients" : "Projects"}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.2", selected: "person.2.fill" }}
          src={ICONS.clients}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="expenses" hidden={money.length === 0}>
        <NativeTabs.Trigger.Label>
          {money.length > 1
            ? "Money"
            : money[0] === "expenses"
              ? "Expenses"
              : "Cashbook"}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "banknote", selected: "banknote.fill" }}
          src={ICONS.money}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
