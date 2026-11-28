import { PLANS } from "@workspace/contracts"
import { router, Stack } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import { NotificationSettings } from "@/components/notification-settings"
import {
  Avatar,
  Chip,
  confirm,
  Icon,
  IconTile,
  ListGroup,
  ListItem,
  SectionHeader,
  SegmentedControl,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useMe } from "@/features/me"
import { canTrackTime } from "@/features/time"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { WEB_URL } from "@/lib/config"
import { initials } from "@/lib/format"
import { REMINDER_HOURS } from "@/lib/reminder-schedule"
import { signOut } from "@/lib/session"
import { type Appearance, useAppearanceStore } from "@/stores/appearance-store"
import { useReminderSettings } from "@/stores/reminder-settings"
import { useWorkspaceStore } from "@/stores/workspace-store"

/**
 * You and this phone: who's signed in, the workspace you're in, how the
 * app looks, notifications, the timer reminder, and signing out. Profile,
 * password and two-factor settings are on the web.
 */
export default function AccountScreen() {
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
  const session = authClient.useSession()
  const me = useMe()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [signingOut, setSigningOut] = React.useState(false)
  const user = session.data?.user
  const plan = me.data ? PLANS[me.data.plan.key]?.name : undefined

  const askSignOut = async () => {
    const ok = await confirm({
      title: "Sign out?",
      message:
        "This phone forgets your session and its timer reminder, and stops getting notifications. Your data stays in Billleaf.",
      confirmLabel: "Sign out",
      destructive: true,
    })
    if (!ok) return
    setSigningOut(true)
    await signOut()
  }

  const openWeb = () => {
    const url = workspace ? `${WEB_URL}/${workspace.slug}/account` : WEB_URL
    void WebBrowser.openBrowserAsync(url).catch((e) =>
      toast.error(errorMessage(e))
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen options={{ title: "Account" }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + playerInset },
        ]}
      >
        <View style={styles.who} accessible>
          <Avatar
            label={initials(user?.name, user?.email)}
            size={56}
            round
            tone="solid"
          />
          <View style={styles.flex}>
            <Text variant="headline" numberOfLines={1}>
              {user?.name ?? "…"}
            </Text>
            <Text variant="callout" tone="muted" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        <View>
          <SectionHeader title="Workspace" />
          <ListGroup>
            <ListItem
              title={workspace?.name ?? "…"}
              subtitle={plan ? `${plan} plan` : undefined}
              leading={<IconTile icon="building" tone="primary" />}
              trailing={
                <Text variant="label" tone="primary" style={styles.bold}>
                  Switch
                </Text>
              }
              accessibilityLabel={`${workspace?.name}${plan ? `, ${plan} plan` : ""}. Switch workspace`}
              onPress={() => router.push("/workspaces")}
            />
          </ListGroup>
        </View>

        <AppearanceSetting />

        <NotificationSettings />

        {canTrackTime(me.data) ? <ReminderSetting /> : null}

        <View>
          <SectionHeader title="Account" />
          <ListGroup>
            <ListItem
              title="Profile and security"
              subtitle="Name, password, two-factor and sessions, on the web"
              leading={<IconTile icon="lock" />}
              trailing={<Icon name="external" size={18} tone="muted" />}
              accessibilityHint="Opens Billleaf in your browser"
              onPress={openWeb}
            />
            <ListItem
              title={signingOut ? "Signing out…" : "Sign out"}
              leading={<IconTile icon="logout" tone="out" />}
              onPress={signingOut ? undefined : () => void askSignOut()}
            />
          </ListGroup>
        </View>
      </ScrollView>
    </View>
  )
}

/** Light, dark or follow the phone. */
function AppearanceSetting() {
  const appearance = useAppearanceStore((s) => s.appearance)
  const setAppearance = useAppearanceStore((s) => s.setAppearance)
  return (
    <View style={styles.group}>
      <SectionHeader title="Appearance" />
      <SegmentedControl<Appearance>
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        value={appearance}
        onChange={(a) => {
          setAppearance(a)
          toast.success(
            a === "system"
              ? "Following your phone's theme"
              : `${a === "light" ? "Light" : "Dark"} theme on`
          )
        }}
      />
    </View>
  )
}

/** After how long a running timer gets a "still running?" notification. */
function ReminderSetting() {
  const { hours, setHours } = useReminderSettings()
  const options = [
    { label: "Off", value: null },
    ...REMINDER_HOURS.map((h) => ({ label: `${h} h`, value: h })),
  ]
  return (
    <View style={styles.group}>
      <SectionHeader title="Timer reminder" />
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip
            key={o.label}
            label={o.label}
            selected={hours === o.value}
            onPress={() => setHours(o.value)}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {hours
          ? `A notification asks whether your timer is still running once it has run for ${hours} hours. On this phone only.`
          : "No reminder for a timer left running. On this phone only."}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Space[4],
    gap: Space[5],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  who: { flexDirection: "row", alignItems: "center", gap: Space[3] },
  group: { gap: Space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
  bold: { fontWeight: "600" },
})
