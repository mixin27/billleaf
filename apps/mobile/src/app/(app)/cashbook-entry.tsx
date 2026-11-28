import { router, useLocalSearchParams } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { PhotoThumb } from "@/components/cashbook/photo-thumb"
import {
  Amount,
  Button,
  confirm,
  ErrorState,
  KeyValue,
  ListGroup,
  ListItem,
  SectionHeader,
  SheetFooter,
  SheetHeader,
  Skeleton,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
import { signedAmount } from "@/lib/money-display"

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

/**
 * One entry in full, as a sheet over the book: the amount, when, the
 * balance after it, its details, photos and history, with Edit and Delete.
 */
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
  const plain = (n: number) => signedAmount(n, currency, locale).text

  const change = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—"
    if (field === "amount") return plain(Number(value))
    if (field === "type") return value === "in" ? "Cash in" : "Cash out"
    if (field === "categoryId" || field === "modeId") return "changed"
    return String(value)
  }

  const askDelete = async () => {
    const ok = await confirm({
      title: "Delete this entry?",
      message: "It comes off the balance. The audit log keeps a record.",
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    remove.mutate([entryId], {
      onSuccess: () => {
        toast.success("Entry deleted")
        router.back()
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  const by = e?.createdBy ? (e.createdBy.you ? "You" : e.createdBy.name) : null

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader
        title={e ? (e.type === "in" ? "Cash in" : "Cash out") : "Entry"}
        onClose={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {entry.error && !entry.data ? (
          <ErrorState
            error={entry.error}
            onRetry={() => void entry.refetch()}
          />
        ) : !e ? (
          <View style={styles.hero}>
            <Skeleton width={180} height={40} />
            <Skeleton width={140} height={14} />
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Amount
                value={e.amount}
                currency={currency}
                locale={locale}
                sign={e.type}
                size="xl"
              />
              <Text variant="callout" tone="muted">
                {`${currency} · ${dayHeading(e.entryDate, locale, today)} · ${timeLabel(e.entryTime, locale)}`}
              </Text>
              <Text variant="caption" tone="subtle" numeric>
                {`Balance after ${signedAmount(e.balance, currency, locale, "auto").text}`}
              </Text>
            </View>

            <ListGroup>
              <KeyValue label="Remark" value={e.remark ?? ""} />
              <KeyValue label="Contact" value={e.contactName ?? ""} />
              <KeyValue label="Category" value={e.categoryName ?? ""} />
              <KeyValue label="Payment mode" value={e.modeName ?? ""} />
              <KeyValue label="Entry by" value={by ?? ""} />
            </ListGroup>

            {e.attachments.length ? (
              <View>
                <SectionHeader title="Photos" />
                <View style={styles.wrap}>
                  {e.attachments.map((a) => (
                    <PhotoThumb
                      key={a.id}
                      uri={a.contentType.startsWith("image/") ? a.url : null}
                      label={a.filename}
                      onPress={() =>
                        void WebBrowser.openBrowserAsync(a.url).catch((err) =>
                          toast.error(errorMessage(err))
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Activity" />
              {activity.data && activity.data.length > 0 ? (
                <ListGroup>
                  {activity.data.map((a, i) => (
                    <ListItem
                      key={`${a.at}-${i}`}
                      title={`${a.action[0]!.toUpperCase()}${a.action.slice(1)} by ${a.by ?? "someone"}`}
                      titleLines={2}
                      subtitle={
                        <View style={styles.changes}>
                          <Text variant="caption" tone="muted">
                            {new Intl.DateTimeFormat(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: profile.data?.timezone,
                            }).format(new Date(a.at))}
                          </Text>
                          {Object.entries(a.changes).map(
                            ([field, [before, after]]) => (
                              <Text key={field} variant="caption" tone="muted">
                                {`${FIELD_LABELS[field] ?? field}: ${change(field, before)} → ${change(field, after)}`}
                              </Text>
                            )
                          )}
                        </View>
                      }
                    />
                  ))}
                </ListGroup>
              ) : (
                <Text variant="callout" tone="muted">
                  {activity.data ? "No history recorded." : "Loading…"}
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
      {e?.editable ? (
        <SheetFooter>
          <Button
            title="Delete"
            icon="trash"
            variant="secondary"
            loading={remove.isPending}
            onPress={askDelete}
          />
          <Button
            title="Edit"
            icon="edit"
            onPress={() =>
              router.push({
                pathname: "/cashbook-entry-edit",
                params: { bookId, entryId },
              })
            }
          />
        </SheetFooter>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
  hero: { alignItems: "center", gap: Space[1], paddingVertical: Space[4] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
  changes: { gap: 2 },
})
