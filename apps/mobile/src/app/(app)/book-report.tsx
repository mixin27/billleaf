import { Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Amount,
  BottomActionBar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListGroup,
  ListItem,
  SegmentedControl,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { dayHeading, type Duration, DURATIONS, nowIn } from "@/lib/cashbook"
import { signedAmount } from "@/lib/money-display"

type Breakdown = "day" | "category" | "mode"

/**
 * A period's report: opening and closing balance, totals, and the entries
 * summed by day, category or payment mode. Share it as the PDF statement
 * or a CSV for Excel. The book's other filters apply too.
 */
export default function BookReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
  const profile = useWorkspaceProfile()
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
  const today = nowIn(profile.data?.timezone).date
  const book = useCashbook(id)
  const bookFilters = useFiltersFor(id)
  const [duration, setDuration] = React.useState<Duration>(
    bookFilters.duration === "all" ? "this_month" : bookFilters.duration
  )
  const [by, setBy] = React.useState<Breakdown>("day")
  const [sharing, setSharing] = React.useState<"pdf" | "csv" | null>(null)
  const filter = toApiFilter({ ...bookFilters, duration }, today)
  const report = useCashbookReport(id, filter)
  const r = report.data
  const currency = book.data?.currency ?? "USD"
  const plain = (n: number, sign: "auto" | "none" = "auto") =>
    signedAmount(n, currency, locale, sign).text
  const otherFilters = Boolean(
    filter.type ||
    filter.categoryId ||
    filter.modeId ||
    filter.memberId ||
    filter.q
  )

  const share = async (kind: "pdf" | "csv") => {
    if (!book.data) return
    setSharing(kind)
    try {
      await shareCashbookFile(book.data, filter, kind)
    } catch (e) {
      toast.error(errorMessage(e))
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
            sub: `Balance ${plain(d.balance)}`,
          }))
      : ((by === "category" ? r?.byCategory : r?.byMode) ?? []).map((c) => ({
          key: c.id ?? "none",
          name: c.name,
          totalIn: c.totalIn,
          totalOut: c.totalOut,
          sub: `Net ${plain(c.totalIn - c.totalOut)}`,
        }))

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen
        options={{ title: book.data ? `${book.data.name} report` : "Report" }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[6] + playerInset },
        ]}
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
              icon="calendar"
              selected={duration === "custom"}
              onPress={() => setDuration("custom")}
            />
          ) : null}
        </ScrollView>

        {report.error && !report.data ? (
          <ErrorState
            error={report.error}
            onRetry={() => void report.refetch()}
          />
        ) : !r ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            <Card>
              <View style={styles.line}>
                <Text variant="callout" tone="muted">
                  Opening balance
                </Text>
                <Amount
                  value={r.openingBalance}
                  currency={currency}
                  locale={locale}
                  sign="auto"
                />
              </View>
              <View style={styles.split}>
                <View style={styles.flex}>
                  <Text variant="caption" tone="muted">
                    Total in
                  </Text>
                  <Amount
                    value={r.totalIn}
                    currency={currency}
                    locale={locale}
                    sign="in"
                  />
                </View>
                <View style={styles.flex}>
                  <Text variant="caption" tone="muted">
                    Total out
                  </Text>
                  <Amount
                    value={r.totalOut}
                    currency={currency}
                    locale={locale}
                    sign="out"
                  />
                </View>
              </View>
              <View style={[styles.closing, { borderTopColor: t.border }]}>
                <Text variant="label" tone="muted">
                  {`Closing balance · ${currency}`}
                </Text>
                <Amount
                  value={r.closingBalance}
                  currency={currency}
                  locale={locale}
                  sign="auto"
                  size="xl"
                />
              </View>
            </Card>
            {otherFilters && r.openingBalance === 0 && filter.from ? (
              <Text variant="caption" tone="muted">
                With filters other than the date, the opening balance starts at
                zero.
              </Text>
            ) : null}

            <SegmentedControl
              options={[
                { value: "day", label: "By day" },
                { value: "category", label: "Category" },
                { value: "mode", label: "Mode" },
              ]}
              value={by}
              onChange={setBy}
            />

            {rows.length === 0 ? (
              <EmptyState
                icon="report"
                title="No entries in this period"
                body="Pick another period above."
              />
            ) : (
              <ListGroup>
                {rows.map((x) => (
                  <ListItem
                    key={x.key}
                    title={x.name}
                    subtitle={x.sub}
                    trailing={
                      <>
                        {x.totalIn ? (
                          <Amount
                            value={x.totalIn}
                            currency={currency}
                            locale={locale}
                            sign="in"
                            size="s"
                          />
                        ) : null}
                        {x.totalOut ? (
                          <Amount
                            value={x.totalOut}
                            currency={currency}
                            locale={locale}
                            sign="out"
                            size="s"
                          />
                        ) : null}
                      </>
                    }
                  />
                ))}
              </ListGroup>
            )}
          </>
        )}
      </ScrollView>
      <BottomActionBar>
        <Button
          title="CSV"
          icon="share"
          variant="secondary"
          loading={sharing === "csv"}
          disabled={sharing !== null || !r}
          onPress={() => share("csv")}
        />
        <Button
          title="Share PDF"
          icon="share"
          loading={sharing === "pdf"}
          disabled={sharing !== null || !r}
          onPress={() => share("pdf")}
        />
      </BottomActionBar>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Space[4],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  bleed: { marginHorizontal: -Space[4] },
  chips: { flexDirection: "row", gap: Space[2], paddingHorizontal: Space[4] },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  split: { flexDirection: "row", gap: Space[4] },
  closing: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space[3],
    gap: Space[1],
  },
})
