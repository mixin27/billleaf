import { PLANS } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { NotificationSettings } from "@/components/notification-settings"
import {
  Body,
  Button,
  Chip,
  Screen,
  Section,
  SegmentedControl,
  Text as UIText,
  toast,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useMe } from "@/features/me"
import { canTrackTime } from "@/features/time"
import { useTheme } from "@/hooks/use-theme"
import { authClient } from "@/lib/auth-client"
import { WEB_URL } from "@/lib/config"
import { initials } from "@/lib/format"
import { REMINDER_HOURS } from "@/lib/reminder-schedule"
import { signOut } from "@/lib/session"
import { type Appearance, useAppearanceStore } from "@/stores/appearance-store"
import { useReminderSettings } from "@/stores/reminder-settings"
import { useWorkspaceStore } from "@/stores/workspace-store"

/**
 * You and this phone: who's signed in, the workspace you're in,
 * notifications, the timer reminder, and signing out. Profile, password and two-factor settings
 * are on the web.
 */
export default function AccountScreen() {
  const t = useTheme()
  const session = authClient.useSession()
  const me = useMe()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [signingOut, setSigningOut] = React.useState(false)
  const user = session.data?.user
  const plan = me.data ? PLANS[me.data.plan.key]?.name : undefined

  const confirmSignOut = () =>
    Alert.alert(
      "Sign out?",
      "This phone forgets your session and its timer reminder, and stops getting notifications. Your data stays in Billleaf.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true)
            await signOut()
          },
        },
      ]
    )

  const openWeb = async () => {
    const url = workspace ? `${WEB_URL}/${workspace.slug}/account` : WEB_URL
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert("Couldn't open the browser", url)
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.who} accessible>
          <View style={[styles.avatar, { backgroundColor: t.primary }]}>
            <Text style={[styles.avatarText, { color: t.onPrimary }]}>
              {initials(user?.name, user?.email)}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={[Type.heading, { color: t.text }]} numberOfLines={1}>
              {user?.name ?? "…"}
            </Text>
            <Text
              style={[Type.body, { color: t.textSecondary }]}
              numberOfLines={1}
            >
              {user?.email}
            </Text>
          </View>
        </View>

        <Section title="Workspace">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${workspace?.name}${plan ? `, ${plan} plan` : ""}. Switch workspace`}
            onPress={() => router.push("/workspaces")}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={styles.flex}>
              <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
                {workspace?.name}
              </Text>
              {plan ? (
                <Text style={[Type.small, { color: t.textSecondary }]}>
                  {`${plan} plan`}
                </Text>
              ) : null}
            </View>
            <Text style={[Type.body, { color: t.primary }]}>Switch</Text>
          </Pressable>
        </Section>

        <AppearanceSetting />

        <NotificationSettings />

        {canTrackTime(me.data) ? <ReminderSetting /> : null}

        <Section title="Account">
          <Pressable
            accessibilityRole="link"
            accessibilityHint="Opens Billleaf in your browser"
            onPress={openWeb}
            style={({ pressed }) => [
              styles.row,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={styles.flex}>
              <Text style={[Type.body, { color: t.text }]}>
                Profile and security
              </Text>
              <Text style={[Type.small, { color: t.textSecondary }]}>
                Name, password, two-factor and sessions, on the web
              </Text>
            </View>
            <Text style={[Type.body, { color: t.primary }]}>Open ↗</Text>
          </Pressable>
        </Section>

        <Button
          title="Sign out"
          variant="secondary"
          loading={signingOut}
          onPress={confirmSignOut}
        />
      </ScrollView>
    </Screen>
  )
}

/** After how long a running timer gets a "still running?" notification. */
function ReminderSetting() {
  const t = useTheme()
  const { hours, setHours } = useReminderSettings()
  const options = [
    { label: "Off", value: null },
    ...REMINDER_HOURS.map((h) => ({ label: `${h} h`, value: h })),
  ]
  return (
    <View style={styles.gap}>
      <Text
        accessibilityRole="header"
        style={[Type.small, styles.heading, { color: t.textSecondary }]}
      >
        TIMER REMINDER
      </Text>
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
      <Body muted style={Type.small}>
        {hours
          ? `A notification asks whether your timer is still running once it has run for ${hours} hours. On this phone only.`
          : "No reminder for a timer left running. On this phone only."}
      </Body>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  who: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  gap: { gap: Spacing.two },
  heading: { fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
})

/** Light, dark or follow the phone. */
function AppearanceSetting() {
  const appearance = useAppearanceStore((s) => s.appearance)
  const setAppearance = useAppearanceStore((s) => s.setAppearance)
  return (
    <View style={{ gap: Spacing.two }}>
      <UIText variant="overline" tone="muted" accessibilityRole="header">
        Appearance
      </UIText>
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
