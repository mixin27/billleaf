import { PUSH_TYPES } from "@workspace/contracts"
import * as React from "react"
import { AppState, Linking, StyleSheet, View } from "react-native"

import {
  Button,
  ErrorState,
  ListGroup,
  SectionHeader,
  SwitchRow,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useMe } from "@/features/me"
import {
  useNotificationSettings,
  useSetNotificationSetting,
} from "@/features/notifications"
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
      toast.error(errorMessage(e))
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
      <SectionHeader title="Notifications" />
      <ListGroup>
        <View style={styles.status}>
          <Text
            variant="callout"
            tone={permission === "granted" ? "default" : "muted"}
          >
            {permission ? status : " "}
          </Text>
          {permission === "undetermined" ? (
            <Button
              title="Turn on notifications"
              icon="bell"
              loading={asking}
              onPress={turnOn}
            />
          ) : permission === "denied" ? (
            <Button
              title="Open Settings"
              icon="external"
              variant="secondary"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </View>
        {settings.error && !settings.data ? (
          <View style={styles.status}>
            <ErrorState
              compact
              error={settings.error}
              onRetry={() => void settings.refetch()}
            />
          </View>
        ) : null}
        {(settings.data?.items ?? []).map((item) => {
          const permissionKey = PUSH_TYPES.find(
            (p) => p.type === item.type
          )?.permission
          const here =
            !me.data ||
            !permissionKey ||
            me.data.permissions.includes(permissionKey)
          return (
            <SwitchRow
              key={item.type}
              title={item.label}
              subtitle={
                here
                  ? undefined
                  : `Not in ${workspace?.name ?? "this workspace"}`
              }
              value={item.enabled}
              onValueChange={(enabled) =>
                set.mutate(
                  { type: item.type, enabled },
                  { onError: (e) => toast.error(errorMessage(e)) }
                )
              }
            />
          )
        })}
      </ListGroup>
      <Text variant="caption" tone="muted">
        These choices are saved on your account, for every phone and workspace.
        You're never notified about what you did yourself.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  gap: { gap: Space[2] },
  status: { gap: Space[3], padding: Space[4] - 2 },
})
