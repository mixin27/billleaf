import { formatMoney } from "@workspace/contracts"
import { Image } from "expo-image"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { Body, Button, Screen, Section } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import {
  useCashbook,
  useCashbookEntry,
  useDeleteEntries,
  useEntryActivity,
} from "@/features/cashbook"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { dayHeading, nowIn, timeLabel } from "@/lib/cashbook"

const FIELD_LABELS: Record<string, string> = {
  type: "Type",
  amount: "Amount",
  entryDate: "Date",
  entryTime: "Time",
  remark: "Remark",
  contactName: "Contact",
  categoryId: "Category",
  modeId: "Payment mode",
}

/** One entry in full: amount, details, attachments and its history. */
export default function CashbookEntryScreen() {
  const { bookId, entryId } = useLocalSearchParams<{
    bookId: string
    entryId: string
  }>()
  const t = useTheme()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const today = nowIn(profile.data?.timezone).date
  const book = useCashbook(bookId)
  const entry = useCashbookEntry(bookId, entryId)
  const activity = useEntryActivity(bookId, entryId)
  const remove = useDeleteEntries(bookId)
  const e = entry.data
  const currency = book.data?.currency ?? "USD"
  const money = (n: number) => formatMoney({ amount: n, currency }, locale)

  const change = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—"
    if (field === "amount") return money(Number(value))
    if (field === "type") return value === "in" ? "Cash in" : "Cash out"
    if (field === "categoryId" || field === "modeId") return "changed"
    return String(value)
  }

  const confirmDelete = () =>
    Alert.alert(
      "Delete this entry?",
      "It leaves the balance. The audit log keeps a record.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            remove.mutate([entryId], {
              onSuccess: () => router.back(),
              onError: (err) =>
                Alert.alert("Couldn't delete", errorMessage(err)),
            }),
        },
      ]
    )

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: e ? (e.type === "in" ? "Cash in" : "Cash out") : "Entry",
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {entry.error ? (
          <Body>{errorMessage(entry.error)}</Body>
        ) : !e ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <View style={styles.summary}>
              <Text
                style={[
                  styles.big,
                  { color: e.type === "in" ? t.primary : t.danger },
                ]}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {`${e.type === "in" ? "+" : "−"}${money(e.amount)}`}
              </Text>
              <Text style={[Type.body, { color: t.textSecondary }]}>
                {`${dayHeading(e.entryDate, locale, today)} · ${timeLabel(e.entryTime, locale)}`}
              </Text>
              <Text style={[Type.small, { color: t.textSecondary }]}>
                {`Balance after: ${money(e.balance)}`}
              </Text>
            </View>

            {e.editable ? (
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    title="Edit"
                    onPress={() =>
                      router.push({
                        pathname: "/cashbook-entry-edit",
                        params: { bookId, entryId },
                      })
                    }
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    title="Delete"
                    variant="secondary"
                    loading={remove.isPending}
                    onPress={confirmDelete}
                  />
                </View>
              </View>
            ) : null}

            <Section title="Details">
              <Detail label="Remark" value={e.remark} />
              <Detail label="Contact" value={e.contactName} />
              <Detail label="Category" value={e.categoryName} />
              <Detail label="Payment mode" value={e.modeName} />
              <Detail
                label="Entry by"
                value={
                  e.createdBy
                    ? e.createdBy.you
                      ? "You"
                      : e.createdBy.name
                    : null
                }
                last
              />
            </Section>

            {e.attachments.length ? (
              <Section title="Attachments">
                <View style={styles.attachments}>
                  {e.attachments.map((a) => (
                    <Pressable
                      key={a.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${a.filename}`}
                      onPress={() =>
                        WebBrowser.openBrowserAsync(a.url).catch((err) =>
                          Alert.alert("Couldn't open it", errorMessage(err))
                        )
                      }
                      style={[styles.thumb, { borderColor: t.border }]}
                    >
                      {a.contentType.startsWith("image/") ? (
                        <Image
                          source={{ uri: a.url }}
                          style={styles.thumbImage}
                          contentFit="cover"
                        />
                      ) : (
                        <Text
                          style={[Type.small, styles.pdf, { color: t.text }]}
                          numberOfLines={3}
                        >
                          {a.filename}
                        </Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              </Section>
            ) : null}

            <Section title="Activity">
              {(activity.data ?? []).map((a, i, all) => (
                <View
                  key={`${a.at}-${i}`}
                  style={[
                    styles.activity,
                    i < all.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: t.border,
                    },
                  ]}
                >
                  <Text style={[Type.body, { color: t.text }]}>
                    {`${a.action[0]!.toUpperCase()}${a.action.slice(1)} by ${a.by ?? "someone"}`}
                  </Text>
                  <Text style={[Type.small, { color: t.textSecondary }]}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: profile.data?.timezone,
                    }).format(new Date(a.at))}
                  </Text>
                  {Object.entries(a.changes).map(([field, [before, after]]) => (
                    <Text
                      key={field}
                      style={[Type.small, { color: t.textSecondary }]}
                    >
                      {`${FIELD_LABELS[field] ?? field}: ${change(field, before)} → ${change(field, after)}`}
                    </Text>
                  ))}
                </View>
              ))}
              {activity.data?.length === 0 ? (
                <Body muted style={styles.activity}>
                  No history recorded.
                </Body>
              ) : null}
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Detail({
  label,
  value,
  last,
}: {
  label: string
  value: string | null | undefined
  last?: boolean
}) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.detail,
        !last && { borderBottomWidth: 1, borderBottomColor: t.border },
      ]}
    >
      <Text style={[Type.small, { color: t.textSecondary }]}>{label}</Text>
      <Text style={[Type.body, styles.value, { color: t.text }]}>
        {value || "—"}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  summary: { gap: Spacing.one },
  big: { fontSize: 34, fontWeight: "700", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", gap: Spacing.two },
  detail: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  value: { flex: 1, textAlign: "right" },
  attachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: { width: "100%", height: "100%" },
  pdf: { padding: Spacing.one, textAlign: "center" },
  activity: { paddingVertical: Spacing.two + 2, gap: 2 },
})
