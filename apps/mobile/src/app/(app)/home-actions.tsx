import { router } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  Checkbox,
  IconButton,
  IconTile,
  ListGroup,
  ListItem,
  SheetFooter,
  SheetHeader,
  Text,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useMe } from "@/features/me"
import { useTheme } from "@/hooks/use-theme"
import { haptic } from "@/lib/haptics"
import {
  canUse,
  MAX_QUICK_ACTIONS,
  QUICK_ACTIONS,
  type QuickActionKey,
  quickActionsFor,
} from "@/lib/quick-actions"
import { useHomeStore } from "@/stores/home-store"

/** Pick up to eight quick actions for Home and put them in order. */
export default function HomeActionsScreen() {
  const t = useTheme()
  const me = useMe()
  const saved = useHomeStore((s) => s.quickActions)
  const setQuickActions = useHomeStore((s) => s.setQuickActions)
  const [chosen, setChosen] = React.useState<QuickActionKey[]>(() =>
    quickActionsFor(me.data, saved).map((a) => a.key)
  )
  const usable = QUICK_ACTIONS.filter((a) => canUse(a.key, me.data))
  const rows = [
    ...chosen.map((k) => usable.find((a) => a.key === k)!).filter(Boolean),
    ...usable.filter((a) => !chosen.includes(a.key)),
  ]
  const full = chosen.length >= MAX_QUICK_ACTIONS

  const toggle = (k: QuickActionKey) => {
    haptic.selection()
    setChosen((c) =>
      c.includes(k) ? c.filter((x) => x !== k) : full ? c : [...c, k]
    )
  }
  const up = (k: QuickActionKey) =>
    setChosen((c) => {
      const i = c.indexOf(k)
      if (i <= 0) return c
      const next = [...c]
      ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
      return next
    })

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader title="Quick actions" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="callout" tone="muted">
          {`Pick up to ${MAX_QUICK_ACTIONS} for Home (${chosen.length} picked). Move one up to put it first.`}
        </Text>
        <ListGroup>
          {rows.map((a) => {
            const on = chosen.includes(a.key)
            const first = chosen[0] === a.key
            return (
              <ListItem
                key={a.key}
                title={a.label}
                leading={
                  <View style={styles.lead}>
                    <Checkbox checked={on} />
                    <IconTile icon={a.icon} size={32} />
                  </View>
                }
                trailing={
                  on && !first ? (
                    <IconButton
                      icon="chevronUp"
                      label={`Move ${a.label} up`}
                      tone="muted"
                      onPress={() => up(a.key)}
                    />
                  ) : null
                }
                selected={on}
                onPress={!on && full ? undefined : () => toggle(a.key)}
                accessibilityLabel={`${a.label}, ${on ? "on Home" : "not on Home"}`}
              />
            )
          })}
        </ListGroup>
      </ScrollView>
      <SheetFooter>
        <Button
          title="Reset"
          variant="secondary"
          onPress={() => {
            setQuickActions(null)
            router.back()
          }}
        />
        <Button
          title="Done"
          onPress={() => {
            setQuickActions(chosen)
            router.back()
          }}
        />
      </SheetFooter>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[3], paddingBottom: Space[8] },
  lead: { flexDirection: "row", alignItems: "center", gap: Space[3] },
})
