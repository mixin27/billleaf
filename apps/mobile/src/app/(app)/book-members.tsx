import {
  CASHBOOK_ROLES,
  type CashbookMember,
  type CashbookRole,
} from "@workspace/contracts"
import { Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Avatar,
  Badge,
  confirm,
  ErrorState,
  Icon,
  initialsOf,
  KeyValue,
  ListGroup,
  ListItem,
  SectionHeader,
  SegmentedControl,
  showActions,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  can,
  useBookMember,
  useCashbook,
  useCashbookMembers,
  useWorkspaceMembers,
} from "@/features/cashbook"
import { useMe } from "@/features/me"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"

const ROLES = Object.keys(CASHBOOK_ROLES) as CashbookRole[]
const fail = (e: unknown) => toast.error(errorMessage(e))

/** Who can use the book and how. Owners add, change and remove people. */
export default function BookMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
  const me = useMe()
  const book = useCashbook(id)
  const members = useCashbookMembers(id)
  const own = can.own(book.data)
  const canListWorkspace =
    own && (me.data?.permissions.includes("member.read") ?? false)
  const workspace = useWorkspaceMembers(canListWorkspace)
  const { add, setRole, remove } = useBookMember(id)
  const [role, setNewRole] = React.useState<CashbookRole>("operator")
  const inBook = new Set(members.data?.map((m) => m.memberId))
  const others = (workspace.data ?? []).filter((m) => !inBook.has(m.id))
  const isMe = (m: CashbookMember) => m.email === me.data?.user.email

  const menu = (m: CashbookMember) =>
    showActions(
      [
        ...ROLES.filter((r) => r !== m.role).map((r) => ({
          label: `Make ${CASHBOOK_ROLES[r].label.toLowerCase()}`,
          onPress: () =>
            setRole.mutate(
              { memberId: m.memberId, role: r },
              {
                onSuccess: () =>
                  toast.success(
                    `${m.name} is now ${CASHBOOK_ROLES[r].label.toLowerCase()}`
                  ),
                onError: fail,
              }
            ),
        })),
        {
          label: "Remove from book",
          icon: "trash" as const,
          destructive: true,
          onPress: async () => {
            if (
              await confirm({
                title: `Remove ${m.name}?`,
                message:
                  "They won't see this book any more. Their entries stay.",
                confirmLabel: "Remove",
                destructive: true,
              })
            )
              remove.mutate(m.memberId, {
                onSuccess: () => toast.success(`${m.name} removed`),
                onError: fail,
              })
          },
        },
      ],
      `${m.name} · ${CASHBOOK_ROLES[m.role].label}`
    )

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen options={{ title: "Members" }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + playerInset },
        ]}
      >
        <View>
          <SectionHeader title={book.data?.name ?? "In this book"} />
          {members.error && !members.data ? (
            <ErrorState
              compact
              error={members.error}
              onRetry={() => void members.refetch()}
            />
          ) : !members.data ? (
            <SkeletonRows rows={2} />
          ) : (
            <ListGroup>
              {members.data.map((m) => (
                <ListItem
                  key={m.memberId}
                  title={isMe(m) ? `${m.name} (you)` : m.name}
                  subtitle={m.email}
                  leading={
                    <Avatar label={initialsOf(m.name)} size={40} round />
                  }
                  trailing={
                    <Badge
                      label={CASHBOOK_ROLES[m.role].label}
                      tone={m.role === "owner" ? "primary" : "neutral"}
                    />
                  }
                  onPress={own && !isMe(m) ? () => menu(m) : undefined}
                  accessibilityHint={
                    own && !isMe(m)
                      ? "Change their role or remove them"
                      : undefined
                  }
                />
              ))}
            </ListGroup>
          )}
        </View>

        {own ? (
          canListWorkspace ? (
            <View style={styles.group}>
              <SectionHeader title="Add from your workspace" />
              {others.length > 0 ? (
                <>
                  <SegmentedControl
                    options={ROLES.map((r) => ({
                      value: r,
                      label: CASHBOOK_ROLES[r].label,
                    }))}
                    value={role}
                    onChange={setNewRole}
                  />
                  <Text variant="caption" tone="muted">
                    {CASHBOOK_ROLES[role].description}
                  </Text>
                </>
              ) : null}
              {workspace.isPending ? (
                <SkeletonRows rows={2} />
              ) : others.length === 0 ? (
                <Text variant="callout" tone="muted">
                  Everyone in the workspace is already in this book. Invite
                  people to the workspace on the web first.
                </Text>
              ) : (
                <ListGroup>
                  {others.map((m) => (
                    <ListItem
                      key={m.id}
                      title={m.name}
                      subtitle={m.email}
                      leading={
                        <Avatar
                          label={initialsOf(m.name)}
                          size={40}
                          round
                          tone="neutral"
                        />
                      }
                      trailing={<Icon name="plus" size={20} tone="primary" />}
                      accessibilityLabel={`Add ${m.name} as ${CASHBOOK_ROLES[role].label.toLowerCase()}`}
                      onPress={
                        add.isPending
                          ? undefined
                          : () =>
                              add.mutate(
                                { memberId: m.id, role },
                                {
                                  onSuccess: () =>
                                    toast.success(`${m.name} added`),
                                  onError: fail,
                                }
                              )
                      }
                    />
                  ))}
                </ListGroup>
              )}
            </View>
          ) : (
            <Text variant="callout" tone="muted">
              Your workspace role can't list members, so add people to this book
              on the web.
            </Text>
          )
        ) : null}

        <View>
          <SectionHeader title="Roles" />
          <ListGroup>
            {ROLES.map((r) => (
              <KeyValue
                key={r}
                stacked
                label={CASHBOOK_ROLES[r].label}
                value={CASHBOOK_ROLES[r].description}
              />
            ))}
          </ListGroup>
        </View>
      </ScrollView>
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
})
