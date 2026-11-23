import type { Contract, Permission } from "@workspace/contracts"
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

import { ContractText } from "@/components/contract-text"
import { Body, Button, Screen, Section } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import {
  CONTRACT_STATUS_LABELS,
  contractTone,
  shareContractPdf,
  useContract,
  useContractStep,
} from "@/features/contracts"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

/**
 * One contract: who it's with, where it stands, and its text. A draft is
 * marked as sent once its fields are filled in; a sent one is emailed,
 * shared, and gets the client's signature or refusal; a signed one can be
 * voided. Writing and editing contracts stays on the web.
 */
export default function ContractScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
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
    Alert.alert(title, errorMessage(e))

  const markSent = () =>
    Alert.alert(
      "Mark as sent?",
      "The contract gets its number and its text can't be changed after this. Email it to the client next so they can sign it in the portal.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark as sent",
          onPress: () =>
            step.mutate(
              { step: "send" },
              { onError: fail("Couldn't mark it as sent") }
            ),
        },
      ]
    )

  const declined = () =>
    Alert.alert(
      "Client declined?",
      "Records that the client won't sign this contract, for an answer you got outside the client portal.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Declined",
          style: "destructive",
          onPress: () =>
            step.mutate(
              { step: "decline" },
              { onError: fail("Couldn't record the answer") }
            ),
        },
      ]
    )

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

  const open = (stepName: "sign" | "void") =>
    router.push({
      pathname: "/contract-step",
      params: { id, step: stepName },
    })

  const unresolved = c?.status === "draft" ? c.unresolvedFields : []

  return (
    <Screen>
      <Stack.Screen options={{ title: c?.number ?? "Draft contract" }} />
      <ScrollView
        contentContainerStyle={styles.content}
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
        {contract.error ? (
          <Body>{errorMessage(contract.error)}</Body>
        ) : !c ? (
          <Body muted>Loading…</Body>
        ) : (
          <>
            <Summary
              contract={c}
              date={date}
              canOpenClient={can("client.read")}
              canOpenQuote={can("quote.read")}
              canOpenProject={can("project.read")}
            />

            <View style={styles.actions}>
              {c.status === "draft" && can("contract.send") ? (
                <>
                  <Button
                    title="Mark as sent"
                    loading={step.isPending}
                    disabled={unresolved.length > 0}
                    onPress={markSent}
                  />
                  {unresolved.length > 0 ? (
                    <Body style={[Type.small, { color: t.danger }]}>
                      {`Fill in ${unresolved.map((f) => `{{${f}}}`).join(", ")} on the web before sending.`}
                    </Body>
                  ) : null}
                </>
              ) : null}
              {c.status === "sent" && can("contract.send") ? (
                <Button title="Record signature" onPress={() => open("sign")} />
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
                {(c.status === "sent" || c.status === "signed") &&
                can("contract.send") ? (
                  <View style={styles.flex}>
                    <Button
                      title="Email client"
                      variant="secondary"
                      onPress={() =>
                        router.push({
                          pathname: "/send",
                          params: { kind: "contract", contractId: c.id },
                        })
                      }
                    />
                  </View>
                ) : null}
              </View>
              {c.status === "sent" && can("contract.send") ? (
                <Button
                  title="Client declined"
                  variant="link"
                  disabled={step.isPending}
                  onPress={declined}
                />
              ) : null}
              {(c.status === "sent" || c.status === "signed") &&
              can("contract.send") ? (
                <Button
                  title="Void contract"
                  variant="link"
                  onPress={() => open("void")}
                />
              ) : null}
              {c.status === "draft" ? (
                <Body muted style={Type.small}>
                  Edit drafts on the web.
                </Body>
              ) : null}
            </View>

            <Section title="Contract">
              <View style={styles.body}>
                <ContractText text={c.renderedBody ?? c.body} />
              </View>
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function Summary({
  contract: c,
  date,
  canOpenClient,
  canOpenQuote,
  canOpenProject,
}: {
  contract: Contract
  date: (iso: string) => string
  canOpenClient: boolean
  canOpenQuote: boolean
  canOpenProject: boolean
}) {
  const t = useTheme()
  const tone = contractTone(c.status)
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
  const link = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="link" onPress={onPress}>
      <Text style={[Type.small, { color: t.primary }]}>{label}</Text>
    </Pressable>
  )
  return (
    <View style={styles.summary}>
      {canOpenClient ? (
        <Pressable
          accessibilityRole="link"
          accessibilityHint="Opens the client"
          onPress={() =>
            router.push({
              pathname: "/client/[id]",
              params: { id: c.clientId },
            })
          }
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[Type.heading, { color: t.primary }]}>
            {c.clientName}
          </Text>
        </Pressable>
      ) : (
        <Text style={[Type.heading, { color: t.text }]}>{c.clientName}</Text>
      )}
      {c.title ? (
        <Text style={[Type.body, { color: t.textSecondary }]}>{c.title}</Text>
      ) : null}
      <Text style={[Type.small, { color: t.textSecondary }]}>
        <Text
          style={{
            color:
              tone === "good" ? t.primary : tone === "bad" ? t.danger : t.text,
            fontWeight: "600",
          }}
        >
          {CONTRACT_STATUS_LABELS[c.status]}
        </Text>
        {term ? ` · ${term}` : ""}
      </Text>
      <Body muted style={Type.small}>
        {`${state}.`}
      </Body>
      {c.quoteId && canOpenQuote
        ? link(`Quote ${c.quoteNumber ?? "(draft)"} ›`, () =>
            router.push({
              pathname: "/quote/[id]",
              params: { id: c.quoteId! },
            })
          )
        : null}
      {c.projectId && canOpenProject
        ? link(`Project: ${c.projectName ?? "open it"} ›`, () =>
            router.push({
              pathname: "/project/[id]",
              params: { id: c.projectId! },
            })
          )
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  summary: { gap: Spacing.one },
  actions: { gap: Spacing.two },
  row: { flexDirection: "row", gap: Spacing.two },
  body: { paddingVertical: Spacing.three },
})
