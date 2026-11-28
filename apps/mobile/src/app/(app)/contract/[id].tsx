import type { Contract, Permission } from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { ContractText } from "@/components/contract-text"
import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Badge,
  type BadgeTone,
  BottomActionBar,
  Button,
  Card,
  confirm,
  ErrorState,
  Icon,
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
import { Radius, Space } from "@/constants/theme"
import {
  CONTRACT_STATUS_LABELS,
  shareContractPdf,
  useContract,
  useContractStep,
} from "@/features/contracts"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { shortDate } from "@/lib/format"

const TONE: Record<Contract["status"], BadgeTone> = {
  draft: "neutral",
  sent: "info",
  signed: "in",
  declined: "out",
  void: "out",
}

/**
 * One contract: who it's with, where it stands, and its text. A draft is
 * marked as sent once its fields are filled in; a sent one is emailed,
 * shared, and gets the client's signature or refusal; a signed one can be
 * voided. Writing and editing contracts stays on the web.
 */
export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
  const me = useMe()
  const can = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const contract = useContract(id)
  const step = useContractStep(id)
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [sharing, setSharing] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const c = contract.data

  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const fail = (title: string) => (e: unknown) =>
    toast.error(`${title}: ${errorMessage(e)}`)

  const markSent = async () => {
    if (
      !(await confirm({
        title: "Mark as sent?",
        message:
          "The contract gets its number and its text can't be changed after this. Email it to the client next so they can sign it in the portal.",
        confirmLabel: "Mark as sent",
      }))
    )
      return
    step.mutate(
      { step: "send" },
      {
        onSuccess: () => toast.success("Contract marked as sent"),
        onError: fail("Couldn't mark it as sent"),
      }
    )
  }

  const declined = async () => {
    if (
      !(await confirm({
        title: "Client declined?",
        message:
          "Records that the client won't sign this contract, for an answer you got outside the client portal.",
        confirmLabel: "Declined",
        destructive: true,
      }))
    )
      return
    step.mutate(
      { step: "decline" },
      {
        onSuccess: () => toast.success("Marked as declined"),
        onError: fail("Couldn't record the answer"),
      }
    )
  }

  const share = async () => {
    if (!c) return
    setSharing(true)
    try {
      await shareContractPdf(c)
    } catch (e) {
      fail("Couldn't get the PDF")(e)
    } finally {
      setSharing(false)
    }
  }

  const email = () => {
    if (!c) return
    router.push({
      pathname: "/send",
      params: { kind: "contract", contractId: c.id },
    })
  }

  const open = (stepName: "sign" | "void") =>
    router.push({
      pathname: "/contract-step",
      params: { id, step: stepName },
    })

  const unresolved = c?.status === "draft" ? c.unresolvedFields : []
  const canSend = can("contract.send")
  const live = c?.status === "sent" || c?.status === "signed"
  // The one main next step, pinned to the bottom.
  const main: "send" | "sign" | "email" | null =
    !c || !canSend
      ? null
      : c.status === "draft"
        ? "send"
        : c.status === "sent"
          ? "sign"
          : c.status === "signed"
            ? "email"
            : null

  const linked =
    c &&
    (can("client.read") ||
      (c.quoteId && can("quote.read")) ||
      (c.projectId && can("project.read")))

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen
        options={{ title: c ? (c.number ?? "Draft contract") : "Contract" }}
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
              await contract.refetch()
              setRefreshing(false)
            }}
          />
        }
      >
        {contract.error && !contract.data ? (
          <ErrorState
            error={contract.error}
            onRetry={() => void contract.refetch()}
          />
        ) : !c ? (
          <Loading />
        ) : (
          <>
            <Summary contract={c} date={date} unresolved={unresolved} />

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
                {live && canSend && main !== "email" ? (
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
              {live && canSend ? (
                <View style={styles.row}>
                  {c.status === "sent" ? (
                    <View style={styles.flex}>
                      <Button
                        title="Client declined"
                        variant="ghost"
                        size="sm"
                        disabled={step.isPending}
                        onPress={() => void declined()}
                      />
                    </View>
                  ) : null}
                  <View style={styles.flex}>
                    <Button
                      title="Void contract"
                      variant="ghost"
                      size="sm"
                      onPress={() => open("void")}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            {linked ? (
              <View>
                <SectionHeader title="Linked" />
                <ListGroup>
                  {can("client.read") ? (
                    <ListItem
                      title={c.clientName}
                      subtitle="Client"
                      leading={<IconTile icon="user" />}
                      chevron
                      accessibilityHint="Opens the client"
                      onPress={() =>
                        router.push({
                          pathname: "/client/[id]",
                          params: { id: c.clientId },
                        })
                      }
                    />
                  ) : null}
                  {c.quoteId && can("quote.read") ? (
                    <ListItem
                      title={`Quote ${c.quoteNumber ?? "(draft)"}`}
                      subtitle="Quote"
                      leading={<IconTile icon="quote" />}
                      chevron
                      onPress={() =>
                        router.push({
                          pathname: "/quote/[id]",
                          params: { id: c.quoteId! },
                        })
                      }
                    />
                  ) : null}
                  {c.projectId && can("project.read") ? (
                    <ListItem
                      title={c.projectName ?? "Open the project"}
                      subtitle="Project"
                      leading={<IconTile icon="folder" />}
                      chevron
                      onPress={() =>
                        router.push({
                          pathname: "/project/[id]",
                          params: { id: c.projectId! },
                        })
                      }
                    />
                  ) : null}
                </ListGroup>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Contract" />
              <ListGroup>
                <View style={styles.body}>
                  <ContractText text={c.renderedBody ?? c.body} />
                </View>
              </ListGroup>
            </View>
          </>
        )}
      </ScrollView>
      {c && main ? (
        <BottomActionBar>
          {main === "send" ? (
            <Button
              title="Mark as sent"
              icon="check"
              loading={step.isPending}
              disabled={unresolved.length > 0}
              onPress={() => void markSent()}
            />
          ) : main === "sign" ? (
            <Button
              title="Record signature"
              icon="edit"
              onPress={() => open("sign")}
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
  contract: c,
  date,
  unresolved,
}: {
  contract: Contract
  date: (iso: string) => string
  unresolved: string[]
}) {
  const t = useTheme()
  const term = [
    c.effectiveDate ? `From ${date(c.effectiveDate)}` : null,
    c.endDate ? `until ${date(c.endDate)}` : null,
  ]
    .filter(Boolean)
    .join(" ")
  const state =
    c.status === "signed"
      ? [
          "Signed",
          c.signedByName ? `by ${c.signedByName}` : null,
          c.signedVia === "portal" ? "in the client portal" : null,
          c.signedAt ? `on ${date(c.signedAt)}` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : c.status === "declined"
        ? `Declined${c.declinedAt ? ` on ${date(c.declinedAt)}` : ""}${
            c.declineReason ? `: “${c.declineReason}”` : ""
          }`
        : c.status === "void"
          ? `Voided${c.voidedAt ? ` on ${date(c.voidedAt)}` : ""}${
              c.voidReason ? `: “${c.voidReason}”` : ""
            }`
          : c.status === "sent" && c.sentAt
            ? `Sent ${date(c.sentAt)}, waiting for the client to sign`
            : "Not sent"
  return (
    <Card>
      <View style={styles.head}>
        <Text variant="callout" tone="muted" numberOfLines={1}>
          {c.number ?? "Draft contract"}
        </Text>
        <Badge label={CONTRACT_STATUS_LABELS[c.status]} tone={TONE[c.status]} />
      </View>
      <View style={styles.tight}>
        <Text variant="headline" selectable>
          {c.clientName}
        </Text>
        {c.title ? (
          <Text variant="callout" tone="muted">
            {c.title}
          </Text>
        ) : null}
      </View>
      {term ? (
        <View style={styles.inline}>
          <Icon name="calendar" size={18} tone="muted" />
          <Text variant="callout" style={styles.flex}>
            {term}
          </Text>
        </View>
      ) : null}
      <Text variant="callout" tone="muted">
        {`${state}.`}
      </Text>
      {c.status === "draft" ? (
        unresolved.length > 0 ? (
          <View style={[styles.warn, { backgroundColor: t.warningSoft }]}>
            <Icon name="alert" size={18} tone="warning" />
            <Text variant="callout" tone="warning" style={styles.flex}>
              {`Fill in ${unresolved.map((f) => `{{${f}}}`).join(", ")} on the web before sending.`}
            </Text>
          </View>
        ) : (
          <Text variant="callout" tone="muted">
            Edit drafts on the web.
          </Text>
        )
      ) : null}
    </Card>
  )
}

function Loading() {
  return (
    <>
      <Card>
        <Skeleton width="40%" height={12} />
        <Skeleton width="70%" height={18} />
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
  inline: { flexDirection: "row", alignItems: "center", gap: Space[2] },
  warn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space[2],
    padding: Space[3],
    borderRadius: Radius.md,
  },
  actions: { gap: Space[2] },
  row: { flexDirection: "row", gap: Space[2] },
  body: { paddingHorizontal: Space[4], paddingVertical: Space[4] },
})
