import { PUSH_TYPES } from "@workspace/contracts"
import * as React from "react"
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native"

import { Body, Button, Section } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import { useMe } from "@/features/me"
import {
  useNotificationSettings,
  useSetNotificationSetting,
} from "@/features/notifications"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import {
  PROJECT_ID,
  pushPermission,
  type PushPermission,
  registerForPush,
} from "@/lib/push"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** The system permission, checked again when you come back from Settings. */
function usePushPermission() {
  const [state, setState] = React.useState<PushPermission | null>(null)
  const check = React.useCallback(
    () => void pushPermission().then(setState, () => {}),
    []
  )
  React.useEffect(() => {
    check()
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check()
    })
    return () => sub.remove()
  }, [check])
  return [state, setState] as const
}

/**
 * Pushes to this phone: turning them on (the system prompt is asked here,
 * not at launch) and which kinds you get. The kinds are saved on your
 * account, so they follow you to every phone.
 */
export function NotificationSettings() {
  const t = useTheme()
  const [permission, setPermission] = usePushPermission()
  const [asking, setAsking] = React.useState(false)
  const settings = useNotificationSettings()
  const set = useSetNotificationSetting()
  const me = useMe()
  const workspace = useWorkspaceStore((s) => s.workspace)

  const turnOn = async () => {
    setAsking(true)
    try {
      const result = await registerForPush({ ask: true })
      setPermission(result === "unavailable" ? "granted" : result)
    } catch (e) {
      Alert.alert("Couldn't turn on notifications", errorMessage(e))
    } finally {
      setAsking(false)
    }
  }

  const status =
    permission === "granted"
      ? PROJECT_ID
        ? "On for this phone."
        : "Allowed, but this build of the app isn't set up for push notifications yet."
      : permission === "denied"
        ? "Notifications are off for Billleaf in your phone's settings."
        : "Get a notification when a client answers a quote, signs a contract or pays you."

  return (
    <View style={styles.gap}>
      <Section title="Notifications">
        <View style={styles.status}>
          <Body muted={permission !== "granted"} style={Type.small}>
            {permission ? status : " "}
          </Body>
          {permission === "undetermined" ? (
            <Button
              title="Turn on notifications"
              loading={asking}
              onPress={turnOn}
            />
          ) : permission === "denied" ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openSettings()}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[Type.body, { color: t.primary }]}>
                Open Settings ↗
              </Text>
            </Pressable>
          ) : null}
        </View>

        {settings.error ? (
          <Body muted style={[Type.small, styles.status]}>
            {errorMessage(settings.error)}
          </Body>
        ) : (
          (settings.data?.items ?? []).map((item) => {
            const permissionKey = PUSH_TYPES.find(
              (p) => p.type === item.type
            )?.permission
            const here =
              !me.data ||
              !permissionKey ||
              me.data.permissions.includes(permissionKey)
            return (
              <View
                key={item.type}
                style={[styles.row, { borderTopColor: t.border }]}
              >
                <View style={styles.flex}>
                  <Text style={[Type.body, { color: t.text }]}>
                    {item.label}
                  </Text>
                  {here ? null : (
                    <Text style={[Type.small, { color: t.textSecondary }]}>
                      {`Not in ${workspace?.name ?? "this workspace"}`}
                    </Text>
                  )}
                </View>
                <Switch
                  accessibilityLabel={item.label}
                  value={item.enabled}
                  onValueChange={(enabled) =>
                    set.mutate({ type: item.type, enabled })
                  }
                  trackColor={{ true: t.primary }}
                />
              </View>
            )
          })
        )}
      </Section>
      <Body muted style={Type.small}>
        These choices are saved on your account, for every phone and workspace.
        You're never notified about what you did yourself.
      </Body>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Spacing.two },
  status: { gap: Spacing.three, paddingVertical: Spacing.three },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
