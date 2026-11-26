import {
  CASHBOOK_ROLES,
  type CashbookMember,
  type CashbookRole,
} from "@workspace/contracts"
import { Stack, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { Body, Chip, Screen, Section } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
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

const ROLES = Object.keys(CASHBOOK_ROLES) as CashbookRole[]

/** Who can use the book and how. Owners add, change and remove people. */
export default function BookMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTheme()
  const me = useMe()
  const book = useCashbook(id)
  const members = useCashbookMembers(id)
  const own = can.own(book.data)
  const canListWorkspace =
    own && (me.data?.permissions.includes("member.read") ?? false)
  const workspace = useWorkspaceMembers(canListWorkspace)
  const { add, setRole, remove } = useBookMember(id)
  const [role, setNewRole] = React.useState<CashbookRole>("operator")
  const fail = (title: string) => (e: unknown) =>
    Alert.alert(title, errorMessage(e))
  const inBook = new Set(members.data?.map((m) => m.memberId))
  const others = (workspace.data ?? []).filter((m) => !inBook.has(m.id))

  const manageMember = (m: CashbookMember) =>
    Alert.alert(
      m.name,
      `${CASHBOOK_ROLES[m.role].label}: ${CASHBOOK_ROLES[m.role].description}`,
      [
        ...ROLES.filter((r) => r !== m.role).map((r) => ({
          text: `Make ${CASHBOOK_ROLES[r].label.toLowerCase()}`,
          onPress: () =>
            setRole.mutate(
              { memberId: m.memberId, role: r },
              { onError: fail("Couldn't change the role") }
            ),
        })),
        {
          text: "Remove from book",
          style: "destructive" as const,
          onPress: () =>
            remove.mutate(m.memberId, {
              onError: fail("Couldn't remove them"),
            }),
        },
        { text: "Cancel", style: "cancel" as const },
      ]
    )

  return (
    <Screen>
      <Stack.Screen options={{ title: "Members" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {members.error ? (
          <Body>{errorMessage(members.error)}</Body>
        ) : (
          <Section title={book.data?.name ?? "Members"}>
            {(members.data ?? []).map((m, i) => (
              <Pressable
                key={m.memberId}
                accessibilityRole={own ? "button" : undefined}
                disabled={!own}
                onPress={() => manageMember(m)}
                style={({ pressed }) => [
                  styles.line,
                  i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View style={styles.flex}>
                  <Text style={[Type.body, { color: t.text }]}>
                    {m.email === me.data?.user.email
                      ? `${m.name} (you)`
                      : m.name}
                  </Text>
                  <Text
                    style={[Type.small, { color: t.textSecondary }]}
                    numberOfLines={1}
                  >
                    {m.email}
                  </Text>
                </View>
                <Text style={[Type.small, styles.role, { color: t.primary }]}>
                  {CASHBOOK_ROLES[m.role].label}
                </Text>
              </Pressable>
            ))}
          </Section>
        )}

        <Section title="Roles">
          {ROLES.map((r, i) => (
            <View
              key={r}
              style={[
                styles.roleLine,
                i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
              ]}
            >
              <Text style={[Type.body, styles.bold, { color: t.text }]}>
                {CASHBOOK_ROLES[r].label}
              </Text>
              <Text style={[Type.small, { color: t.textSecondary }]}>
                {CASHBOOK_ROLES[r].description}
              </Text>
            </View>
          ))}
        </Section>

        {own ? (
          canListWorkspace ? (
            <View style={styles.gap}>
              <Text
                style={[Type.small, styles.bold, { color: t.textSecondary }]}
              >
                ADD SOMEONE FROM YOUR WORKSPACE
              </Text>
              <View style={styles.wrap}>
                {ROLES.map((r) => (
                  <Chip
                    key={r}
                    label={`As ${CASHBOOK_ROLES[r].label.toLowerCase()}`}
                    selected={role === r}
                    onPress={() => setNewRole(r)}
                  />
                ))}
              </View>
              {workspace.isPending ? (
                <Body muted>Loading…</Body>
              ) : others.length === 0 ? (
                <Body muted>
                  Everyone in the workspace is already in this book. Invite
                  people to the workspace on the web first.
                </Body>
              ) : (
                <Section title="Workspace members">
                  {others.map((m, i) => (
                    <Pressable
                      key={m.id}
                      accessibilityRole="button"
                      accessibilityHint={`Adds them as ${CASHBOOK_ROLES[role].label.toLowerCase()}`}
                      onPress={() =>
                        add.mutate(
                          { memberId: m.id, role },
                          { onError: fail("Couldn't add them") }
                        )
                      }
                      style={({ pressed }) => [
                        styles.line,
                        i > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: t.border,
                        },
                        { opacity: pressed ? 0.6 : 1 },
                      ]}
                    >
                      <View style={styles.flex}>
                        <Text style={[Type.body, { color: t.text }]}>
                          {m.name}
                        </Text>
                        <Text
                          style={[Type.small, { color: t.textSecondary }]}
                          numberOfLines={1}
                        >
                          {m.email}
                        </Text>
                      </View>
                      <Text
                        style={[Type.body, styles.bold, { color: t.primary }]}
                      >
                        Add
                      </Text>
                    </Pressable>
                  ))}
                </Section>
              )}
            </View>
          ) : (
            <Body muted style={Type.small}>
              Your workspace role can't list members, so add people to this book
              on the web.
            </Body>
          )
        ) : null}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  gap: { gap: Spacing.two },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  roleLine: { paddingVertical: Spacing.two + 2, gap: 2 },
  role: { fontWeight: "600" },
  bold: { fontWeight: "600" },
})
