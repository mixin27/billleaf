import {
  discountLabel,
  formatMoney,
  type Permission,
  type Quote,
} from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { LineItems, Total } from "@/components/line-items"
import { Body, Button, Screen, Section } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import {
  QUOTE_STATUS_LABELS,
  quoteDisplay,
  shareQuotePdf,
  useInvoiceFromQuote,
  useProjectFromQuote,
  useQuote,
  useQuoteStep,
} from "@/features/quotes"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

/**
 * One quote: its total and lines, and the next step for where it is.
 * A draft is marked as sent; a sent quote is emailed, shared, and gets the
 * client's answer; an accepted one becomes an invoice or a project.
 * Writing and editing quotes stay on the web.
 */
export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const quote = useQuote(id)
  const step = useQuoteStep(id)
  const toInvoice = useInvoiceFromQuote(id)
  const toProject = useProjectFromQuote(id)
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [sharing, setSharing] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const q = quote.data

  const money = (amount: number) =>
    formatMoney({ amount, currency: q?.currency ?? "USD" }, locale)
  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const fail = (title: string) => (e: unknown) =>
    Alert.alert(title, errorMessage(e))

  const confirm = (
    title: string,
    message: string,
    action: string,
    run: () => void
  ) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: action, onPress: run },
    ])

  const markSent = () =>
    confirm(
      "Mark as sent?",
      "The quote gets its number and can't be edited after this. Email it to the client next, or send the PDF yourself.",
      "Mark as sent",
      () => step.mutate("send", { onError: fail("Couldn't mark it as sent") })
    )

  const answer = (accept: boolean) =>
    confirm(
      accept ? "Client accepted?" : "Client declined?",
      accept
        ? "Records that the client accepted this quote, for an answer you got outside the client portal."
        : "Records that the client declined this quote, for an answer you got outside the client portal.",
      accept ? "Accepted" : "Declined",
      () =>
        step.mutate(accept ? "accept" : "decline", {
          onError: fail("Couldn't record the answer"),
        })
    )

  const share = async () => {
    if (!q) return
    setSharing(true)
    try {
      await shareQuotePdf(q)
    } catch (e) {
      fail("Couldn't get the PDF")(e)
    } finally {
      setSharing(false)
    }
  }

  const createInvoice = () =>
    confirm(
      "Create invoice?",
      "Creates a draft invoice with this quote's items. Review and issue it on the web.",
      "Create draft",
      () =>
        toInvoice.mutate(undefined, {
          onSuccess: (inv) =>
            router.push({ pathname: "/invoice/[id]", params: { id: inv.id } }),
          onError: fail("Couldn't create the invoice"),
        })
    )

  const startProject = () =>
    toProject.mutate(undefined, {
      onSuccess: (p) =>
        router.push({ pathname: "/project/[id]", params: { id: p.id } }),
      onError: fail("Couldn't start the project"),
    })

  return (
    <Screen>
      <Stack.Screen options={{ title: q?.number ?? "Draft quote" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await quote.refetch()
              setRefreshing(false)
            }}
          />
        }
      >
        {quote.error ? (
          <Body>{errorMessage(quote.error)}</Body>
        ) : !q ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Summary
              quote={q}
              money={money}
              date={date}
              canOpenClient={can("client.read")}
            />

            <View style={styles.actions}>
              {q.status === "draft" && can("quote.send") ? (
                <Button
                  title="Mark as sent"
                  loading={step.isPending}
                  onPress={markSent}
                />
              ) : null}
              {q.status === "accepted" &&
              !q.invoiceId &&
              can("invoice.create") ? (
                <Button
                  title="Create invoice"
                  loading={toInvoice.isPending}
                  onPress={createInvoice}
                />
              ) : null}
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    title="Share PDF"
                    variant="secondary"
                    loading={sharing}
                    onPress={share}
                  />
                </View>
                {q.status !== "draft" && can("quote.send") ? (
                  <View style={styles.flex}>
                    <Button
                      title="Email client"
                      variant="secondary"
                      onPress={() =>
                        router.push({
                          pathname: "/send",
                          params: { kind: "quote", quoteId: q.id },
                        })
                      }
                    />
                  </View>
                ) : null}
              </View>
              {q.status === "sent" && can("quote.update") ? (
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Button
                      title="Declined"
                      variant="secondary"
                      disabled={step.isPending}
                      onPress={() => answer(false)}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Button
                      title="Accepted"
                      variant="secondary"
                      disabled={step.isPending}
                      onPress={() => answer(true)}
                    />
                  </View>
                </View>
              ) : null}
              {q.status === "accepted" &&
              !q.projectId &&
              can("project.create") ? (
                <Button
                  title="Start project"
                  variant="link"
                  loading={toProject.isPending}
                  onPress={startProject}
                />
              ) : null}
              {q.status === "draft" ? (
                <Body muted style={Type.small}>
                  Edit drafts on the web.
                </Body>
              ) : null}
            </View>

            <Section title="Items">
              <LineItems lines={q.lines} money={money}>
                <Total label="Subtotal" value={money(q.subtotal)} />
                {q.discountTotal ? (
                  <Total
                    label={
                      q.discount?.type === "percent"
                        ? `Discount (${discountLabel(q.discount)})`
                        : "Discount"
                    }
                    value={`−${money(q.discountTotal)}`}
                  />
                ) : null}
                {q.taxTotal ? (
                  <Total label="Tax" value={money(q.taxTotal)} />
                ) : null}
                <Total label="Total" value={money(q.total)} bold />
              </LineItems>
            </Section>

            {q.notes ? (
              <Section title="Notes">
                <Body style={styles.text} selectable>
                  {q.notes}
                </Body>
              </Section>
            ) : null}
            {q.terms ? (
              <Section title="Terms">
                <Body style={styles.text} selectable>
                  {q.terms}
                </Body>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Summary({
  quote: q,
  money,
  date,
  canOpenClient,
}: {
  quote: Quote
  money: (n: number) => string
  date: (iso: string) => string
  canOpenClient: boolean
}) {
  const t = useTheme()
  const display = quoteDisplay(q)
  const dates = [
    q.status === "draft" ? "Not sent" : `Issued ${date(q.issueDate)}`,
    q.validUntil && q.status !== "accepted" && q.status !== "declined"
      ? `${display === "expired" ? "Expired" : "Valid until"} ${date(q.validUntil)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  // Who answered, and how.
  const answered =
    q.status === "accepted" || q.status === "declined"
      ? [
          `${q.status === "accepted" ? "Accepted" : "Declined"}${
            q.respondedByName ? ` by ${q.respondedByName}` : ""
          }`,
          q.respondedVia === "portal" ? "in the client portal" : null,
          (q.acceptedAt ?? q.declinedAt)
            ? `on ${date(q.acceptedAt ?? q.declinedAt!)}`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null
  return (
    <View style={styles.summary}>
      {canOpenClient ? (
        <Pressable
          accessibilityRole="link"
          accessibilityHint="Opens the client"
          onPress={() =>
            router.push({
              pathname: "/client/[id]",
              params: { id: q.clientId },
            })
          }
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[Type.heading, { color: t.primary }]}>
            {q.clientName}
          </Text>
        </Pressable>
      ) : (
        <Text style={[Type.heading, { color: t.text }]}>{q.clientName}</Text>
      )}
      {q.title ? (
        <Text style={[Type.body, { color: t.textSecondary }]}>{q.title}</Text>
      ) : null}
      <Text
        style={[styles.big, { color: t.text }]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {money(q.total)}
      </Text>
      <Text style={[Type.small, { color: t.textSecondary }]}>
        <Text
          style={{
            color:
              display === "accepted"
                ? t.primary
                : display === "expired" || display === "declined"
                  ? t.danger
                  : t.text,
            fontWeight: "600",
          }}
        >
          {QUOTE_STATUS_LABELS[display]}
        </Text>
        {dates ? ` · ${dates}` : ""}
      </Text>
      {answered ? (
        <Body muted style={Type.small}>
          {answered}
          {q.declineReason ? `: “${q.declineReason}”` : "."}
        </Body>
      ) : null}
      {q.invoiceId ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({
              pathname: "/invoice/[id]",
              params: { id: q.invoiceId! },
            })
          }
        >
          <Text style={[Type.small, { color: t.primary }]}>
            {`Invoiced as ${q.invoiceNumber ?? "a draft invoice"} ›`}
          </Text>
        </Pressable>
      ) : null}
      {q.projectId ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({
              pathname: "/project/[id]",
              params: { id: q.projectId! },
            })
          }
        >
          <Text style={[Type.small, { color: t.primary }]}>
            {`Project: ${q.projectName ?? "open it"} ›`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  summary: { gap: Spacing.one },
  big: { fontSize: 34, fontWeight: "700", fontVariant: ["tabular-nums"] },
  actions: { gap: Spacing.two },
  row: { flexDirection: "row", gap: Spacing.two },
  text: { paddingVertical: Spacing.two + 2 },
})
