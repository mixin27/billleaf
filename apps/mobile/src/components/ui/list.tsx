import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"

import { Radius, Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

import { Checkbox, Toggle } from "./controls"
import { Icon, type IconName, Text } from "./text"

/**
 * Rows in one rounded group with thin dividers (CashBook's flat list).
 * Cards are only for summaries; lists use this.
 */
export function ListGroup({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  const items = React.Children.toArray(children).filter(Boolean)
  return (
    <View
      style={[
        styles.group,
        { backgroundColor: t.surface, borderColor: t.border },
      ]}
    >
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <View style={[styles.divider, { backgroundColor: t.border }]} />
          ) : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  )
}

/** A leading icon on a tinted square (rows, quick actions, empty states). */
export function IconTile({
  icon,
  tone = "neutral",
  size = 36,
}: {
  icon: IconName
  tone?: "neutral" | "primary" | "in" | "out"
  size?: number
}) {
  const t = useTheme()
  const [bg, fg] = {
    neutral: [t.surfaceMuted, t.textMuted],
    primary: [t.primarySoft, t.inText],
    in: [t.inSoft, t.inText],
    out: [t.outSoft, t.outText],
  }[tone]
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} color={fg} />
    </View>
  )
}

/**
 * One row: optional leading element, a title and subtitle, and a trailing
 * element (amount, badge, switch, chevron). Pressable when given onPress;
 * `selected` shows the multi-select state.
 */
export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  chevron,
  onPress,
  onLongPress,
  selected,
  accessibilityLabel,
  accessibilityHint,
  titleLines = 1,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  chevron?: boolean
  onPress?: () => void
  onLongPress?: () => void
  selected?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  titleLines?: number
}) {
  const t = useTheme()
  const body = (
    <>
      {leading}
      <View style={styles.mid}>
        {typeof title === "string" ? (
          <Text variant="bodyStrong" numberOfLines={titleLines}>
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === "string" ? (
            <Text variant="callout" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {trailing ? <View style={styles.end}>{trailing}</View> : null}
      {chevron ? <Icon name="chevronRight" size={18} tone="subtle" /> : null}
    </>
  )
  if (!onPress && !onLongPress)
    return (
      <View
        accessible={Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
        style={styles.row}
      >
        {body}
      </View>
    )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected !== undefined ? { selected } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        selected && { backgroundColor: t.surfaceSelected },
        pressed && { backgroundColor: t.pressed },
      ]}
    >
      {body}
    </Pressable>
  )
}

/** A row with a switch on the right. */
export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  title: string
  subtitle?: string
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <ListItem
      title={title}
      subtitle={subtitle}
      trailing={
        <Toggle
          label={title}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
      }
    />
  )
}

/** A row with a checkbox on the left. */
export function CheckboxRow({
  title,
  subtitle,
  checked,
  onToggle,
}: {
  title: string
  subtitle?: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <ListItem
      title={title}
      subtitle={subtitle}
      leading={<Checkbox checked={checked} />}
      onPress={onToggle}
      selected={checked}
    />
  )
}

/** A label above a list ("YESTERDAY, 26 NOV") with an optional action. */
export function SectionHeader({
  title,
  trailing,
  action,
}: {
  title: string
  trailing?: React.ReactNode
  action?: { label: string; onPress: () => void }
}) {
  return (
    <View style={styles.sectionHead}>
      <Text variant="overline" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={10}
        >
          <Text variant="label" tone="primary" style={{ fontWeight: "600" }}>
            {action.label}
          </Text>
        </Pressable>
      ) : (
        trailing
      )}
    </View>
  )
}

/** Label and value: side by side (`inline`) or stacked. */
export function KeyValue({
  label,
  value,
  stacked,
}: {
  label: string
  value: React.ReactNode
  stacked?: boolean
}) {
  return (
    <View style={stacked ? styles.kvStacked : styles.kv}>
      <Text variant="callout" tone="muted">
        {label}
      </Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text
          variant="label"
          style={stacked ? undefined : styles.kvValue}
          selectable
        >
          {value || "—"}
        </Text>
      ) : (
        value
      )}
    </View>
  )
}

/** A surface for summaries (balance, this week): not for lists. */
export function Card({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode
  onPress?: () => void
  accessibilityLabel?: string
}) {
  const t = useTheme()
  const style = [
    styles.card,
    { backgroundColor: t.surface, borderColor: t.border },
  ]
  if (!onPress) return <View style={style}>{children}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && { opacity: 0.9 }]}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  group: {
    borderWidth: 1,
    borderRadius: Radius.lg - 2,
    overflow: "hidden",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Space[4] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[3],
    minHeight: 60,
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[3],
  },
  mid: { flex: 1, minWidth: 0, gap: 1 },
  end: { alignItems: "flex-end", gap: 2, flexShrink: 0 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingTop: Space[5],
    paddingBottom: Space[2],
  },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Space[3],
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[3],
  },
  kvValue: { flexShrink: 1, textAlign: "right" },
  kvStacked: {
    gap: 2,
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[3],
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Space[4],
    gap: Space[3],
  },
})
