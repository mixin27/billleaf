import type { CashbookFields, CashbookOption } from "@workspace/contracts"
import { router, Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Badge,
  Button,
  confirm,
  ErrorState,
  IconButton,
  IconTile,
  KeyboardAvoid,
  KeyValue,
  ListGroup,
  ListItem,
  SectionHeader,
  showActions,
  SkeletonRows,
  SwitchRow,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"

const FIELD_LABELS: Record<keyof CashbookFields, string> = {
  contact: "Contact",
  category: "Category",
  mode: "Payment mode",
}

const fail = (e: unknown) => toast.error(errorMessage(e))

/** A book's name, entry fields, categories, modes, members and archiving. */
export default function BookSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
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
  const renamed = name !== null && name.trim() && name.trim() !== b?.name

  const patch = (body: Parameters<typeof update.mutate>[0], done: string) =>
    update.mutate(body, { onSuccess: () => toast.success(done), onError: fail })

  const askDelete = async () => {
    if (
      !(await confirm({
        title: `Delete ${b?.name}?`,
        message:
          "Every entry and photo in this book is deleted for everyone, and it can't be undone. Archive it instead to keep the history.",
        confirmLabel: "Delete book",
        destructive: true,
      }))
    )
      return
    destroy.mutate(undefined, {
      onSuccess: () => {
        toast.success(`${b?.name} deleted`)
        router.dismissTo("/(tabs)/expenses")
      },
      onError: fail,
    })
  }

  const askLeave = async () => {
    if (!myRow) return
    if (
      !(await confirm({
        title: `Leave ${b?.name}?`,
        message: "You won't see this book any more.",
        confirmLabel: "Leave",
        destructive: true,
      }))
    )
      return
    removeMember.mutate(myRow.memberId, {
      onSuccess: () => {
        toast.success(`You left ${b?.name}`)
        router.dismissTo("/(tabs)/expenses")
      },
      onError: fail,
    })
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen options={{ title: "Book settings" }} />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Space[8] + playerInset },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {book.error && !book.data ? (
            <ErrorState
              error={book.error}
              onRetry={() => void book.refetch()}
            />
          ) : !b ? (
            <SkeletonRows rows={4} />
          ) : (
            <>
              {manage ? (
                <View style={styles.group}>
                  <TextField
                    label="Book name"
                    value={name ?? b.name}
                    onChangeText={setName}
                    maxLength={80}
                    returnKeyType="done"
                    onSubmitEditing={() =>
                      renamed
                        ? update.mutate(
                            { name: name!.trim() },
                            {
                              onSuccess: () => {
                                setName(null)
                                toast.success("Name saved")
                              },
                              onError: fail,
                            }
                          )
                        : undefined
                    }
                  />
                  {renamed ? (
                    <Button
                      title="Save name"
                      loading={update.isPending}
                      onPress={() =>
                        update.mutate(
                          { name: name!.trim() },
                          {
                            onSuccess: () => {
                              setName(null)
                              toast.success("Name saved")
                            },
                            onError: fail,
                          }
                        )
                      }
                    />
                  ) : null}
                </View>
              ) : null}

              <View>
                <SectionHeader title="People" />
                <ListGroup>
                  <ListItem
                    title={`${b.memberCount} ${b.memberCount === 1 ? "member" : "members"}`}
                    subtitle={`You're ${b.role}`}
                    leading={<IconTile icon="people" tone="primary" />}
                    chevron
                    onPress={() =>
                      router.push({ pathname: "/book-members", params: { id } })
                    }
                  />
                </ListGroup>
              </View>

              <View>
                <SectionHeader title="Entry fields" />
                <ListGroup>
                  {(Object.keys(FIELD_LABELS) as (keyof CashbookFields)[]).map(
                    (k) => (
                      <SwitchRow
                        key={k}
                        title={FIELD_LABELS[k]}
                        value={b.fields[k]}
                        disabled={!manage || update.isPending}
                        onValueChange={(v) =>
                          patch(
                            { fields: { [k]: v } },
                            `${FIELD_LABELS[k]} ${v ? "shown" : "hidden"}`
                          )
                        }
                      />
                    )
                  )}
                </ListGroup>
                <Text variant="caption" tone="muted" style={styles.hint}>
                  Turn off what this book doesn't need; the entry form gets
                  shorter.
                </Text>
              </View>

              <Options bookId={id} kind="categories" canEdit={manage} />
              <Options bookId={id} kind="modes" canEdit={manage} />

              <View>
                <SectionHeader title="Currency" />
                <ListGroup>
                  <KeyValue
                    label={
                      b.entryCount
                        ? "Fixed: the book has entries"
                        : "Set when the book was added"
                    }
                    value={b.currency}
                  />
                </ListGroup>
              </View>

              {own ? (
                <View style={styles.group}>
                  <SectionHeader title="Archive or delete" />
                  <Button
                    title={b.archivedAt ? "Unarchive book" : "Archive book"}
                    icon="folder"
                    variant="secondary"
                    loading={update.isPending}
                    onPress={() =>
                      patch(
                        { archived: !b.archivedAt },
                        b.archivedAt ? "Book unarchived" : "Book archived"
                      )
                    }
                  />
                  <Button
                    title="Delete book"
                    icon="trash"
                    variant="danger"
                    loading={destroy.isPending}
                    onPress={askDelete}
                  />
                </View>
              ) : myRow ? (
                <Button
                  title="Leave book"
                  icon="logout"
                  variant="secondary"
                  loading={removeMember.isPending}
                  onPress={askLeave}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoid>
    </View>
  )
}

/** Categories or payment modes: add, rename, hide (archive) or delete. */
function Options({
  bookId,
  kind,
  canEdit,
}: {
  bookId: string
  kind: OptionKind
  canEdit: boolean
}) {
  const list = useCashbookOptions(bookId, kind)
  const save = useSaveOption(bookId, kind)
  const remove = useDeleteOption(bookId, kind)
  const [adding, setAdding] = React.useState("")
  const [editing, setEditing] = React.useState<{
    id: string
    name: string
  } | null>(null)
  const title = kind === "categories" ? "Categories" : "Payment modes"
  const noun = kind === "categories" ? "category" : "payment mode"

  const add = () => {
    const n = adding.trim()
    if (!n) return
    save.mutate(
      { name: n },
      {
        onSuccess: () => {
          setAdding("")
          toast.success(`${n} added`)
        },
        onError: fail,
      }
    )
  }
  const rename = () => {
    if (!editing?.name.trim()) return
    save.mutate(
      { id: editing.id, name: editing.name.trim() },
      { onSuccess: () => setEditing(null), onError: fail }
    )
  }

  const menu = (o: CashbookOption) =>
    showActions(
      [
        {
          label: "Rename",
          icon: "edit",
          onPress: () => setEditing({ id: o.id, name: o.name }),
        },
        {
          label: o.archived ? "Show again" : "Hide from the entry form",
          icon: "folder",
          onPress: () =>
            save.mutate({ id: o.id, archived: !o.archived }, { onError: fail }),
        },
        {
          label: "Delete",
          icon: "trash",
          destructive: true,
          onPress: async () => {
            if (
              await confirm({
                title: `Delete ${o.name}?`,
                message: `Entries keep their amounts but lose this ${noun}.`,
                confirmLabel: "Delete",
                destructive: true,
              })
            )
              remove.mutate(o.id, {
                onSuccess: () => toast.success(`${o.name} deleted`),
                onError: fail,
              })
          },
        },
      ],
      o.name
    )

  return (
    <View style={styles.group}>
      <SectionHeader title={title} />
      {list.data && list.data.length > 0 ? (
        <ListGroup>
          {list.data.map((o) =>
            editing?.id === o.id ? (
              <View key={o.id} style={styles.edit}>
                <View style={styles.flex}>
                  <TextField
                    label={`Rename ${noun}`}
                    value={editing.name}
                    onChangeText={(n) => setEditing({ id: o.id, name: n })}
                    autoFocus
                    maxLength={60}
                    returnKeyType="done"
                    onSubmitEditing={rename}
                  />
                </View>
                <Button
                  title="Save"
                  variant="secondary"
                  fullWidth={false}
                  loading={save.isPending}
                  onPress={rename}
                />
              </View>
            ) : (
              <ListItem
                key={o.id}
                title={o.name}
                trailing={
                  <View style={styles.trail}>
                    {o.archived ? <Badge label="Hidden" /> : null}
                    {canEdit ? (
                      <IconButton
                        icon="more"
                        label={`${o.name} options`}
                        tone="muted"
                        onPress={() => menu(o)}
                      />
                    ) : null}
                  </View>
                }
              />
            )
          )}
        </ListGroup>
      ) : list.data ? (
        <Text
          variant="callout"
          tone="muted"
        >{`No ${title.toLowerCase()} yet.`}</Text>
      ) : null}
      {canEdit ? (
        <View style={styles.addRow}>
          <View style={styles.flex}>
            <TextField
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
          <Button
            title="Add"
            icon="plus"
            variant="secondary"
            fullWidth={false}
            loading={save.isPending && !editing}
            onPress={add}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Space[4],
    gap: Space[5],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  group: { gap: Space[2] },
  hint: { marginTop: Space[2] },
  edit: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space[2],
    padding: Space[3],
  },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: Space[2] },
  trail: { flexDirection: "row", alignItems: "center", gap: Space[1] },
})
