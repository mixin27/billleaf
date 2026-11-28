import { type CashbookFields, type CashbookOption } from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native"

import {
  Body,
  Button,
  Field,
  KeyboardAvoid,
  Screen,
  Section,
  ErrorState,
} from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import {
  can,
  type OptionKind,
  useBookMember,
  useCashbook,
  useCashbookMembers,
  useCashbookOptions,
  useDeleteCashbook,
  useDeleteOption,
  useSaveOption,
  useUpdateCashbook,
} from "@/features/cashbook"
import { useMe } from "@/features/me"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"

const FIELD_LABELS: Record<keyof CashbookFields, string> = {
  contact: "Contact name",
  category: "Category",
  mode: "Payment mode",
}

/** A book's name, entry fields, categories, modes, members and archiving. */
export default function BookSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const me = useMe()
  const book = useCashbook(id)
  const b = book.data
  const members = useCashbookMembers(id)
  const update = useUpdateCashbook(id)
  const destroy = useDeleteCashbook(id)
  const { remove: removeMember } = useBookMember(id)
  const [name, setName] = React.useState<string | null>(null)
  const manage = can.manage(b)
  const own = can.own(b)
  const myRow = members.data?.find((m) => m.email === me.data?.user.email)

  const patch = (
    body: Parameters<typeof update.mutate>[0],
    done?: () => void
  ) =>
    update.mutate(body, {
      onSuccess: () => done?.(),
      onError: (e) => Alert.alert("Couldn't save", errorMessage(e)),
    })

  const confirmDelete = () =>
    Alert.alert(
      `Delete ${b?.name}?`,
      "Every entry and attachment in this book is deleted for everyone. This can't be undone. Archive it instead to keep the history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete book",
          style: "destructive",
          onPress: () =>
            destroy.mutate(undefined, {
              onSuccess: () => router.dismissTo("/(tabs)/expenses"),
              onError: (e) => Alert.alert("Couldn't delete", errorMessage(e)),
            }),
        },
      ]
    )

  const leave = () =>
    myRow &&
    Alert.alert(`Leave ${b?.name}?`, "You won't see this book any more.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () =>
          removeMember.mutate(myRow.memberId, {
            onSuccess: () => router.dismissTo("/(tabs)/expenses"),
            onError: (e) => Alert.alert("Couldn't leave", errorMessage(e)),
          }),
      },
    ])

  return (
    <Screen>
      <Stack.Screen options={{ title: "Book settings" }} />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {book.error && !book.data ? (
            <ErrorState
              compact
              error={book.error}
              onRetry={() => void book.refetch()}
            />
          ) : !b ? (
            <Body muted>Loading…</Body>
          ) : (
            <>
              {manage ? (
                <View style={styles.gap}>
                  <Field
                    label="Book name"
                    value={name ?? b.name}
                    onChangeText={setName}
                    maxLength={80}
                    returnKeyType="done"
                    onSubmitEditing={() =>
                      name?.trim() && name.trim() !== b.name
                        ? patch({ name: name.trim() }, () => setName(null))
                        : undefined
                    }
                  />
                  {name !== null && name.trim() && name.trim() !== b.name ? (
                    <Button
                      title="Save name"
                      loading={update.isPending}
                      onPress={() =>
                        patch({ name: name.trim() }, () => setName(null))
                      }
                    />
                  ) : null}
                </View>
              ) : null}

              <Section title="Members">
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: "/book-members", params: { id } })
                  }
                  style={({ pressed }) => [
                    styles.line,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[Type.body, { color: t.text }]}>
                    {`${b.memberCount} ${b.memberCount === 1 ? "member" : "members"} · you're ${b.role}`}
                  </Text>
                  <Text style={[Type.body, { color: t.primary }]}>›</Text>
                </Pressable>
              </Section>

              <Section title="Entry fields">
                {(Object.keys(FIELD_LABELS) as (keyof CashbookFields)[]).map(
                  (k, i) => (
                    <View
                      key={k}
                      style={[
                        styles.line,
                        i > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: t.border,
                        },
                      ]}
                    >
                      <Text style={[Type.body, { color: t.text }]}>
                        {FIELD_LABELS[k]}
                      </Text>
                      <Switch
                        accessibilityLabel={`Show ${FIELD_LABELS[k]}`}
                        value={b.fields[k]}
                        disabled={!manage || update.isPending}
                        onValueChange={(v) => patch({ fields: { [k]: v } })}
                        trackColor={{ true: t.primary }}
                      />
                    </View>
                  )
                )}
              </Section>
              <Body muted style={[Type.small, styles.hint]}>
                Turn off what this book doesn't need; the entry form gets
                shorter.
              </Body>

              <Options
                bookId={id}
                kind="categories"
                title="Categories"
                canEdit={manage}
              />
              <Options
                bookId={id}
                kind="modes"
                title="Payment modes"
                canEdit={manage}
              />

              <Section title="Currency">
                <View style={styles.line}>
                  <Text style={[Type.body, { color: t.text }]}>
                    {b.currency}
                  </Text>
                  <Text style={[Type.small, { color: t.textSecondary }]}>
                    {b.entryCount
                      ? "Fixed: the book has entries"
                      : "Set when the book was added"}
                  </Text>
                </View>
              </Section>

              {own ? (
                <View style={styles.gap}>
                  <Button
                    title={b.archivedAt ? "Unarchive book" : "Archive book"}
                    variant="secondary"
                    loading={update.isPending}
                    onPress={() => patch({ archived: !b.archivedAt })}
                  />
                  <Button
                    title="Delete book"
                    variant="danger"
                    loading={destroy.isPending}
                    onPress={confirmDelete}
                  />
                </View>
              ) : myRow ? (
                <Button
                  title="Leave book"
                  variant="secondary"
                  onPress={leave}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoid>
    </Screen>
  )
}

/** Categories or payment modes: add, rename, hide (archive) or delete. */
function Options({
  bookId,
  kind,
  title,
  canEdit,
}: {
  bookId: string
  kind: OptionKind
  title: string
  canEdit: boolean
}) {
  const t = useTheme()
  const list = useCashbookOptions(bookId, kind)
  const save = useSaveOption(bookId, kind)
  const remove = useDeleteOption(bookId, kind)
  const [adding, setAdding] = React.useState("")
  const [editing, setEditing] = React.useState<{
    id: string
    name: string
  } | null>(null)
  const noun = kind === "categories" ? "category" : "payment mode"

  const fail = (e: unknown) => Alert.alert("Couldn't save", errorMessage(e))
  const add = () =>
    adding.trim() &&
    save.mutate(
      { name: adding.trim() },
      { onSuccess: () => setAdding(""), onError: fail }
    )

  const actions = (o: CashbookOption) =>
    Alert.alert(o.name, undefined, [
      { text: "Rename", onPress: () => setEditing({ id: o.id, name: o.name }) },
      {
        text: o.archived ? "Show again" : "Hide",
        onPress: () =>
          save.mutate({ id: o.id, archived: !o.archived }, { onError: fail }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            `Delete ${o.name}?`,
            `Entries keep their amounts but lose this ${noun}.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => remove.mutate(o.id, { onError: fail }),
              },
            ]
          ),
      },
      { text: "Cancel", style: "cancel" },
    ])

  return (
    <Section title={title}>
      {(list.data ?? []).map((o, i) => (
        <View
          key={o.id}
          style={[i > 0 && { borderTopWidth: 1, borderTopColor: t.border }]}
        >
          {editing?.id === o.id ? (
            <View style={[styles.edit]}>
              <View style={styles.flex}>
                <Field
                  label={`Rename ${noun}`}
                  value={editing.name}
                  onChangeText={(name) => setEditing({ id: o.id, name })}
                  autoFocus
                  maxLength={60}
                />
              </View>
              <View style={styles.small}>
                <Button
                  title="Save"
                  variant="secondary"
                  onPress={() =>
                    editing.name.trim() &&
                    save.mutate(
                      { id: o.id, name: editing.name.trim() },
                      { onSuccess: () => setEditing(null), onError: fail }
                    )
                  }
                />
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole={canEdit ? "button" : undefined}
              disabled={!canEdit}
              onPress={() => actions(o)}
              style={({ pressed }) => [
                styles.line,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  Type.body,
                  { color: o.archived ? t.textSecondary : t.text },
                ]}
              >
                {o.archived ? `${o.name} (hidden)` : o.name}
              </Text>
              {canEdit ? (
                <Text style={[Type.body, { color: t.textSecondary }]}>⋯</Text>
              ) : null}
            </Pressable>
          )}
        </View>
      ))}
      {list.data?.length === 0 ? (
        <Body
          muted
          style={styles.empty}
        >{`No ${title.toLowerCase()} yet.`}</Body>
      ) : null}
      {canEdit ? (
        <View
          style={[styles.edit, { borderTopWidth: 1, borderTopColor: t.border }]}
        >
          <View style={styles.flex}>
            <Field
              label={`New ${noun}`}
              value={adding}
              onChangeText={setAdding}
              placeholder={
                kind === "categories"
                  ? "e.g. Sales, Stock, Rent"
                  : "e.g. KBZPay, Wave"
              }
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={add}
            />
          </View>
          <View style={styles.small}>
            <Button
              title="Add"
              variant="secondary"
              loading={save.isPending}
              onPress={add}
            />
          </View>
        </View>
      ) : null}
    </Section>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  gap: { gap: Spacing.two },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 4,
    minHeight: 48,
  },
  edit: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  small: { width: 84 },
  hint: { marginTop: -Spacing.three },
  empty: { paddingVertical: Spacing.two },
})
