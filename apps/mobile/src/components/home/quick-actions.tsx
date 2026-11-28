import { router } from "expo-router"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"

import { Icon, showActions, Text, toast } from "@/components/ui"
import { Space } from "@/constants/theme"
import { can, useCashbooks } from "@/features/cashbook"
import { useMe } from "@/features/me"
import { useTheme } from "@/hooks/use-theme"
import { haptic } from "@/lib/haptics"
import {
  type QuickAction,
  type QuickActionKey,
  MAX_QUICK_ACTIONS,
  quickActionsFor,
} from "@/lib/quick-actions"
import { useHomeStore } from "@/stores/home-store"
import { useSalesPane, useWorkPane } from "@/stores/panes"

const TILE = 54

/**
 * Round tiles for what you do most, like a wallet app's Send / Scan.
 * Only what your role can do; Edit picks and orders them.
 */
export function QuickActions() {
  const me = useMe()
  const picked = useHomeStore((s) => s.quickActions)
  const books = useCashbooks()
  const actions = quickActionsFor(me.data, picked)
  const canCreateBook =
    me.data?.permissions.includes("cashbook.create") ?? false

  const cash = (type: "in" | "out") => {
    const writable = (books.data ?? []).filter((b) => can.addEntries(b))
    const open = (bookId: string) =>
      router.push({
        pathname: "/cashbook-entry-edit",
        params: { bookId, type },
      })
    if (writable.length === 1) return open(writable[0]!.id)
    if (writable.length > 1)
      return showActions(
        writable.map((b) => ({
          label: b.name,
          icon: "book",
          onPress: () => open(b.id),
        })),
        type === "in" ? "Cash in to which book?" : "Cash out of which book?"
      )
    if (canCreateBook) {
      toast.info("Add a book first, then record cash in and out.")
      return router.push("/book-new")
    }
    toast.info("You haven't been added to a cashbook yet.")
  }

  const run = (key: QuickActionKey) => {
    haptic.press()
    switch (key) {
      case "cashIn":
        return cash("in")
      case "cashOut":
        return cash("out")
      case "timer":
        return router.push("/timer")
      case "logTime":
        return router.push("/entry-edit")
      case "expense":
        return router.push("/expense-new")
      case "newBook":
        return router.push("/book-new")
      case "invoices":
        useSalesPane.getState().setPane("invoices")
        return router.push("/sales")
      case "quotes":
        useSalesPane.getState().setPane("quotes")
        return router.push("/sales")
      case "clients":
        useWorkPane.getState().setPane("clients")
        return router.push("/work")
      case "approvals":
        return router.push("/approvals")
    }
  }

  if (!me.data) return null
  const full = actions.length >= MAX_QUICK_ACTIONS
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {actions.map((a) => (
          <Tile key={a.key} action={a} onPress={() => run(a.key)} />
        ))}
        {full ? null : <EditTile />}
      </View>
      {full ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit quick actions"
          onPress={() => router.push("/home-actions")}
          hitSlop={8}
          style={styles.editLink}
        >
          <Icon name="edit" size={16} tone="primary" />
          <Text variant="label" tone="primary" style={{ fontWeight: "600" }}>
            Edit
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function Tile({
  action: a,
  onPress,
}: {
  action: QuickAction
  onPress: () => void
}) {
  const t = useTheme()
  const [bg, fg] = {
    in: [t.inSoft, t.inText],
    out: [t.outSoft, t.outText],
    primary: [t.primarySoft, t.inText],
    info: [t.infoSoft, t.info],
    neutral: [t.surfaceMuted, t.textMuted],
  }[a.tone]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.label}
      onPress={onPress}
      style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.tile, { backgroundColor: bg }]}>
        <Icon name={a.icon} size={26} color={fg} />
      </View>
      <Text variant="caption" numberOfLines={1} style={styles.label}>
        {a.label}
      </Text>
    </Pressable>
  )
}

function EditTile() {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit quick actions"
      onPress={() => router.push("/home-actions")}
      style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.tile, styles.edit, { borderColor: t.borderStrong }]}>
        <Icon name="edit" size={22} tone="muted" />
      </View>
      <Text variant="caption" tone="muted" style={styles.label}>
        Edit
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: Space[2] },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: Space[4] },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[1],
    alignSelf: "flex-end",
  },
  cell: { width: "25%", alignItems: "center", gap: Space[2] },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  edit: { borderWidth: 1.5, borderStyle: "dashed" },
  label: { textAlign: "center", paddingHorizontal: 2 },
})
