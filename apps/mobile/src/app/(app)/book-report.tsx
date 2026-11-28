import { formatMoney } from "@workspace/contracts"
import { Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native"

import {
  Body,
  Button,
  Chip,
  Screen,
  Section,
  ErrorState,
} from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import {
  shareCashbookFile,
  toApiFilter,
  useCashbook,
  useCashbookReport,
  useFiltersFor,
} from "@/features/cashbook"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { dayHeading, type Duration, DURATIONS, nowIn } from "@/lib/cashbook"

type View_ = "day" | "category" | "mode"

/**
 * Reports for a period: opening and closing balance, totals, and the
 * entries summed by day, category or payment mode. Share them as a PDF
 * statement or a CSV for Excel. Uses the book's other filters too.
 */
export default function BookReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const today = nowIn(profile.data?.timezone).date
  const book = useCashbook(id)
  const bookFilters = useFiltersFor(id)
  const [duration, setDuration] = React.useState<Duration>(
    bookFilters.duration === "all" ? "this_month" : bookFilters.duration
  )
  const [by, setBy] = React.useState<View_>("day")
  const [sharing, setSharing] = React.useState<"pdf" | "csv" | null>(null)
  const filter = toApiFilter({ ...bookFilters, duration }, today)
  const report = useCashbookReport(id, filter)
  const r = report.data
  const currency = book.data?.currency ?? "USD"
  const money = (n: number) => formatMoney({ amount: n, currency }, locale)

  const share = async (kind: "pdf" | "csv") => {
    if (!book.data) return
    setSharing(kind)
    try {
      await shareCashbookFile(book.data, filter, kind)
    } catch (e) {
      Alert.alert("Couldn't get the file", errorMessage(e))
    } finally {
      setSharing(null)
    }
  }

  const rows =
    by === "day"
      ? (r?.byDay ?? [])
          .slice()
          .reverse()
          .map((d) => ({
            key: d.date,
            name: dayHeading(d.date, locale, today),
            totalIn: d.totalIn,
            totalOut: d.totalOut,
            sub: `Balance ${money(d.balance)}`,
          }))
      : ((by === "category" ? r?.byCategory : r?.byMode) ?? []).map((c) => ({
          key: c.id ?? "none",
          name: c.name,
          totalIn: c.totalIn,
          totalOut: c.totalOut,
          sub: `Net ${money(c.totalIn - c.totalOut)}`,
        }))

  return (
    <Screen>
      <Stack.Screen
        options={{ title: `${book.data?.name ?? "Book"} reports` }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.chips}
        >
          {DURATIONS.map((d) => (
            <Chip
              key={d.value}
              label={d.label}
              selected={duration === d.value}
              onPress={() => setDuration(d.value)}
            />
          ))}
          {bookFilters.duration === "custom" ? (
            <Chip
              label={`${bookFilters.from ?? "…"} – ${bookFilters.to ?? "…"}`}
              selected={duration === "custom"}
              onPress={() => setDuration("custom")}
            />
          ) : null}
        </ScrollView>

        {report.error && !report.data ? (
          <ErrorState
            compact
            error={report.error}
            onRetry={() => void report.refetch()}
          />
        ) : !r ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Section title="Summary">
              <Line label="Opening balance" value={money(r.openingBalance)} />
              <Line
                label="Total in (+)"
                value={money(r.totalIn)}
                color={t.primary}
                border
              />
              <Line
                label="Total out (−)"
                value={money(r.totalOut)}
                color={t.danger}
                border
              />
              <Line
                label="Closing balance"
                value={money(r.closingBalance)}
                bold
                border
              />
            </Section>

            <View style={styles.row}>
              <View style={styles.flex}>
                <Button
                  title="Share PDF"
                  loading={sharing === "pdf"}
                  disabled={sharing !== null}
                  onPress={() => share("pdf")}
                />
              </View>
              <View style={styles.flex}>
                <Button
                  title="Excel (CSV)"
                  variant="secondary"
                  loading={sharing === "csv"}
                  disabled={sharing !== null}
                  onPress={() => share("csv")}
                />
              </View>
            </View>

            <View style={styles.chipsRow}>
              <Chip
                label="Day-wise"
                selected={by === "day"}
                onPress={() => setBy("day")}
              />
              <Chip
                label="By category"
                selected={by === "category"}
                onPress={() => setBy("category")}
              />
              <Chip
                label="By mode"
                selected={by === "mode"}
                onPress={() => setBy("mode")}
              />
            </View>

            {rows.length === 0 ? (
              <Body muted>No entries in this period.</Body>
            ) : (
              <Section
                title={
                  by === "day"
                    ? "Day-wise"
                    : by === "category"
                      ? "By category"
                      : "By payment mode"
                }
              >
                {rows.map((x, i) => (
                  <View
                    key={x.key}
                    style={[
                      styles.item,
                      i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text style={[Type.body, { color: t.text }]}>
                        {x.name}
                      </Text>
                      <Text style={[Type.small, { color: t.textSecondary }]}>
                        {x.sub}
                      </Text>
                    </View>
                    <View style={styles.right}>
                      {x.totalIn ? (
                        <Text
                          style={[Type.small, styles.num, { color: t.primary }]}
                        >
                          {`+${money(x.totalIn)}`}
                        </Text>
                      ) : null}
                      {x.totalOut ? (
                        <Text
                          style={[Type.small, styles.num, { color: t.danger }]}
                        >
                          {`−${money(x.totalOut)}`}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Section>
            )}
            {r.openingBalance === 0 &&
            filter.from &&
            (filter.type ||
              filter.categoryId ||
              filter.modeId ||
              filter.memberId ||
              filter.q) ? (
              <Body muted style={Type.small}>
                With filters other than the date, the opening balance starts at
                zero.
              </Body>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Line({
  label,
  value,
  color,
  bold,
  border,
}: {
  label: string
  value: string
  color?: string
  bold?: boolean
  border?: boolean
}) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.line,
        border && { borderTopWidth: 1, borderTopColor: t.border },
      ]}
    >
      <Text
        style={[
          Type.body,
          { color: t.textSecondary },
          bold && { color: t.text, fontWeight: "600" },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          Type.body,
          styles.num,
          { color: color ?? t.text },
          bold && styles.bold,
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  bleed: { marginHorizontal: -Spacing.four },
  chips: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  row: { flexDirection: "row", gap: Spacing.two },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.two + 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  right: { alignItems: "flex-end", gap: 2 },
  num: { fontVariant: ["tabular-nums"], fontWeight: "600" },
  bold: { fontWeight: "700" },
})
