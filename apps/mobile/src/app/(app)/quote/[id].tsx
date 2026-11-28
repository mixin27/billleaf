import {
  discountLabel,
  formatMoney,
  type Permission,
  type Quote,
} from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { LineItems, Total } from "@/components/line-items"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Amount,
  Badge,
  type BadgeTone,
  BottomActionBar,
  Button,
  Card,
  confirm,
  ErrorState,
  IconTile,
  ListGroup,
  ListItem,
  RefreshControl,
  SectionHeader,
  Skeleton,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { shortDate } from "@/lib/format"

const TONE: Record<ReturnType<typeof quoteDisplay>, BadgeTone> = {
  draft: "neutral",
  sent: "info",
  accepted: "in",
  declined: "out",
  expired: "out",
}

/**
 * One quote: its total and lines, and the next step for where it is.
 * A draft is marked as sent; a sent quote is emailed, shared, and gets the
 * client's answer; an accepted one becomes an invoice or a project.
 * Writing and editing quotes stay on the web.
 */
export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
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
    toast.error(`${title}: ${errorMessage(e)}`)

  const markSent = async () => {
    if (
      !(await confirm({
        title: "Mark as sent?",
        message:
          "The quote gets its number and can't be edited after this. Email it to the client next, or send the PDF yourself.",
        confirmLabel: "Mark as sent",
      }))
    )
      return
    step.mutate("send", {
      onSuccess: () => toast.success("Quote marked as sent"),
      onError: fail("Couldn't mark it as sent"),
    })
  }

  const answer = async (accept: boolean) => {
    if (
      !(await confirm({
        title: accept ? "Client accepted?" : "Client declined?",
        message: accept
          ? "Records that the client accepted this quote, for an answer you got outside the client portal."
          : "Records that the client declined this quote, for an answer you got outside the client portal.",
        confirmLabel: accept ? "Accepted" : "Declined",
        destructive: !accept,
      }))
    )
      return
    step.mutate(accept ? "accept" : "decline", {
      onSuccess: () =>
        toast.success(accept ? "Marked as accepted" : "Marked as declined"),
      onError: fail("Couldn't record the answer"),
    })
  }

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

  const email = () => {
    if (!q) return
    router.push({
      pathname: "/send",
      params: { kind: "quote", quoteId: q.id },
    })
  }

  const createInvoice = async () => {
    if (
      !(await confirm({
        title: "Create invoice?",
        message:
          "Creates a draft invoice with this quote's items. Review and issue it on the web.",
        confirmLabel: "Create draft",
      }))
    )
      return
    toInvoice.mutate(undefined, {
      onSuccess: (inv) =>
        router.push({ pathname: "/invoice/[id]", params: { id: inv.id } }),
      onError: fail("Couldn't create the invoice"),
    })
  }

  const startProject = () =>
    toProject.mutate(undefined, {
      onSuccess: (p) =>
        router.push({ pathname: "/project/[id]", params: { id: p.id } }),
      onError: fail("Couldn't start the project"),
    })

  // The one main next step, pinned to the bottom.
  const canMarkSent = q?.status === "draft" && can("quote.send")
  const canInvoice =
    q?.status === "accepted" && !q.invoiceId && can("invoice.create")
  const canEmail = Boolean(q && q.status !== "draft" && can("quote.send"))
  const main: "send" | "invoice" | "email" | null = canMarkSent
    ? "send"
    : canInvoice
      ? "invoice"
      : canEmail
        ? "email"
        : null

  const canAnswer = q?.status === "sent" && can("quote.update")
  const canStartProject =
    q?.status === "accepted" && !q.projectId && can("project.create")
  const linked =
    q && (can("client.read") || q.invoiceId || q.projectId) ? true : false

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen
        options={{ title: q ? (q.number ?? "Draft quote") : "Quote" }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + (main ? 0 : playerInset) },
        ]}
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
        {quote.error && !quote.data ? (
          <ErrorState
            error={quote.error}
            onRetry={() => void quote.refetch()}
          />
        ) : !q ? (
          <Loading />
        ) : (
          <>
            <Summary quote={q} money={money} date={date} locale={locale} />

            <View style={styles.actions}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    title="Share PDF"
                    icon="share"
                    variant="secondary"
                    size="sm"
                    loading={sharing}
                    onPress={share}
                  />
                </View>
                {canEmail && main !== "email" ? (
                  <View style={styles.flex}>
                    <Button
                      title="Email client"
                      icon="mail"
                      variant="secondary"
                      size="sm"
                      onPress={email}
                    />
                  </View>
                ) : null}
              </View>
              {canAnswer ? (
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Button
                      title="Declined"
                      variant="secondary"
                      size="sm"
                      disabled={step.isPending}
                      onPress={() => void answer(false)}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Button
                      title="Accepted"
                      icon="check"
                      variant="tonal"
                      size="sm"
                      disabled={step.isPending}
                      onPress={() => void answer(true)}
                    />
                  </View>
                </View>
              ) : null}
              {canStartProject ? (
                <Button
                  title="Start project"
                  icon="folder"
                  variant="ghost"
                  size="sm"
                  loading={toProject.isPending}
                  onPress={startProject}
                />
              ) : null}
            </View>

            {linked ? (
              <View>
                <SectionHeader title="Linked" />
                <ListGroup>
                  {can("client.read") ? (
                    <ListItem
                      title={q.clientName}
                      subtitle="Client"
                      leading={<IconTile icon="user" />}
                      chevron
                      accessibilityHint="Opens the client"
                      onPress={() =>
                        router.push({
                          pathname: "/client/[id]",
                          params: { id: q.clientId },
                        })
                      }
                    />
                  ) : null}
                  {q.invoiceId ? (
                    <ListItem
                      title={`Invoiced as ${q.invoiceNumber ?? "a draft invoice"}`}
                      subtitle="Invoice"
                      leading={<IconTile icon="invoice" />}
                      chevron
                      onPress={() =>
                        router.push({
                          pathname: "/invoice/[id]",
                          params: { id: q.invoiceId! },
                        })
                      }
                    />
                  ) : null}
                  {q.projectId ? (
                    <ListItem
                      title={q.projectName ?? "Open the project"}
                      subtitle="Project"
                      leading={<IconTile icon="folder" />}
                      chevron
                      onPress={() =>
                        router.push({
                          pathname: "/project/[id]",
                          params: { id: q.projectId! },
                        })
                      }
                    />
                  ) : null}
                </ListGroup>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Items" />
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
            </View>

            {q.notes ? <TextSection title="Notes" text={q.notes} /> : null}
            {q.terms ? <TextSection title="Terms" text={q.terms} /> : null}
          </>
        )}
      </ScrollView>
      {q && main ? (
        <BottomActionBar>
          {main === "send" ? (
            <Button
              title="Mark as sent"
              icon="check"
              loading={step.isPending}
              onPress={() => void markSent()}
            />
          ) : main === "invoice" ? (
            <Button
              title="Create invoice"
              icon="invoice"
              loading={toInvoice.isPending}
              onPress={() => void createInvoice()}
            />
          ) : (
            <Button title="Email client" icon="mail" onPress={email} />
          )}
        </BottomActionBar>
      ) : null}
    </View>
  )
}

function Summary({
  quote: q,
  money,
  date,
  locale,
}: {
  quote: Quote
  money: (n: number) => string
  date: (iso: string) => string
  locale: string
}) {
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
  // What happens next, in one line.
  const next =
    display === "draft"
      ? "Edit drafts on the web."
      : display === "sent"
        ? "Waiting for the client's answer."
        : display === "expired"
          ? "Past its valid date."
          : null
  return (
    <Card>
      <View style={styles.head}>
        <Text variant="callout" tone="muted" numberOfLines={1}>
          {q.number ?? "Draft quote"}
        </Text>
        <Badge label={QUOTE_STATUS_LABELS[display]} tone={TONE[display]} />
      </View>
      <View style={styles.tight}>
        <Text variant="headline" selectable>
          {q.clientName}
        </Text>
        {q.title ? (
          <Text variant="callout" tone="muted">
            {q.title}
          </Text>
        ) : null}
      </View>
      <View
        accessible
        accessibilityLabel={`Total ${money(q.total)}`}
        style={styles.tight}
      >
        <Text variant="caption" tone="muted">
          Total
        </Text>
        <Amount
          value={q.total}
          currency={q.currency}
          locale={locale}
          size="xl"
        />
      </View>
      {dates ? (
        <Text variant="callout" tone="muted">
          {dates}
        </Text>
      ) : null}
      {answered ? (
        <Text variant="callout" tone="muted">
          {answered}
          {q.declineReason ? `: “${q.declineReason}”` : "."}
        </Text>
      ) : null}
      {next ? (
        <Text variant="callout" tone={display === "expired" ? "out" : "muted"}>
          {next}
        </Text>
      ) : null}
    </Card>
  )
}

function TextSection({ title, text }: { title: string; text: string }) {
  return (
    <View>
      <SectionHeader title={title} />
      <ListGroup>
        <View style={styles.text}>
          <Text variant="body" selectable>
            {text}
          </Text>
        </View>
      </ListGroup>
    </View>
  )
}

function Loading() {
  return (
    <>
      <Card>
        <Skeleton width="40%" height={12} />
        <Skeleton width="70%" height={18} />
        <Skeleton width="55%" height={32} />
        <Skeleton width="60%" height={12} />
      </Card>
      <SkeletonRows rows={3} />
    </>
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
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space[2],
  },
  tight: { gap: Space[0.5] },
  actions: { gap: Space[2] },
  row: { flexDirection: "row", gap: Space[2] },
  text: { paddingHorizontal: Space[4] - 2, paddingVertical: Space[3] },
})
