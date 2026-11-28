import { EXPENSE_PAYMENT_METHOD_LABELS } from "@workspace/contracts"
import { Image } from "expo-image"
import { router, useLocalSearchParams } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"

import {
  Amount,
  Badge,
  Button,
  EmptyState,
  Icon,
  KeyValue,
  ListGroup,
  SectionHeader,
  SheetFooter,
  SheetHeader,
  Text,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useCachedExpense } from "@/features/expenses"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { WEB_URL } from "@/lib/config"
import { useWorkspaceStore } from "@/stores/workspace-store"

/**
 * One expense, read-only: the amount, its details and the receipt. Edit
 * or delete it on the web (the app records new ones).
 */
export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const e = useCachedExpense(id)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale

  const open = (url: string) =>
    void WebBrowser.openBrowserAsync(url).catch((err) =>
      toast.error(errorMessage(err))
    )

  if (!e)
    return (
      <View style={[styles.flex, { backgroundColor: t.surface }]}>
        <SheetHeader title="Expense" onClose={() => router.back()} />
        <View style={styles.content}>
          <EmptyState
            icon="receipt"
            title="Expense not found"
            body="It may have been changed or deleted on the web."
          />
        </View>
      </View>
    )

  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${e.spentOn}T00:00:00Z`))
  const image = e.receipt?.contentType.startsWith("image/")

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader title="Expense" onClose={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Amount
            value={e.amount}
            currency={e.currency}
            locale={locale}
            size="xl"
          />
          <Text variant="callout" tone="muted">
            {`${e.currency} · ${date}`}
          </Text>
          {e.billable ? (
            <Badge
              label={
                e.invoiceNumber ? `Billed on ${e.invoiceNumber}` : "Billable"
              }
              tone="info"
            />
          ) : null}
        </View>

        <ListGroup>
          <KeyValue label="Paid to" value={e.vendor ?? ""} />
          <KeyValue label="Category" value={e.categoryName ?? ""} />
          <KeyValue
            label="Paid with"
            value={EXPENSE_PAYMENT_METHOD_LABELS[e.paymentMethod]}
          />
          {e.reference ? (
            <KeyValue label="Reference" value={e.reference} />
          ) : null}
          {e.taxAmount ? (
            <KeyValue
              label="Tax included"
              value={
                <Amount
                  value={e.taxAmount}
                  currency={e.currency}
                  locale={locale}
                  size="s"
                />
              }
            />
          ) : null}
          {e.clientName ? (
            <KeyValue label="Client" value={e.clientName} />
          ) : null}
          {e.projectName ? (
            <KeyValue label="Project" value={e.projectName} />
          ) : null}
          {e.description ? (
            <KeyValue label="Note" value={e.description} stacked />
          ) : null}
        </ListGroup>

        <View>
          <SectionHeader title="Receipt" />
          {e.receipt ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open the receipt, ${e.receipt.filename}`}
              onPress={() => open(e.receipt!.url)}
              style={[
                styles.receipt,
                { borderColor: t.border, backgroundColor: t.surfaceMuted },
              ]}
            >
              {image ? (
                <Image
                  source={{ uri: e.receipt.url }}
                  style={styles.image}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.file}>
                  <Icon name="attach" size={24} tone="muted" />
                  <Text variant="label" numberOfLines={2}>
                    {e.receipt.filename}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : (
            <Text variant="callout" tone="muted">
              No receipt attached. Add one on the web.
            </Text>
          )}
        </View>
      </ScrollView>
      <SheetFooter>
        <Button
          title="Edit on the web"
          icon="external"
          variant="secondary"
          onPress={() =>
            open(workspace ? `${WEB_URL}/${workspace.slug}/expenses` : WEB_URL)
          }
        />
      </SheetFooter>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
  hero: { alignItems: "center", gap: Space[1], paddingVertical: Space[4] },
  receipt: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: "hidden",
    aspectRatio: 3 / 4,
    maxHeight: 420,
  },
  image: { width: "100%", height: "100%" },
  file: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Space[2],
    padding: Space[4],
  },
})
