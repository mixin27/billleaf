import type { Permission } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  AppBar,
  confirm,
  IconTile,
  type IconName,
  ListGroup,
  ListItem,
  SectionHeader,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useMe } from "@/features/me"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { authClient } from "@/lib/auth-client"
import { signOut } from "@/lib/session"
import {
  type SalesPane,
  useSalesPane,
  useWorkPane,
  type WorkPane,
} from "@/stores/panes"
import { useWorkspaceStore } from "@/stores/workspace-store"

type Item = {
  key: string
  title: string
  subtitle?: string
  icon: IconName
  onPress: () => void
}

const sales = (pane: SalesPane) => () => {
  useSalesPane.getState().setPane(pane)
  router.push("/sales")
}
const work = (pane: WorkPane) => () => {
  useWorkPane.getState().setPane(pane)
  router.push("/work")
}

/**
 * Everything that isn't on the bar, grouped: Sales, Work and You. Only
 * what your role can open shows.
 */
export default function MoreScreen() {
  const me = useMe()
  const session = authClient.useSession()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const inset = useMiniPlayerInset()
  const [signingOut, setSigningOut] = React.useState(false)
  const has = (p: Permission) => me.data?.permissions.includes(p) ?? false
  const when = (ok: boolean, item: Item): Item[] => (ok ? [item] : [])

  const salesItems: Item[] = [
    ...when(has("invoice.read"), {
      key: "invoices",
      title: "Invoices",
      subtitle: "What you're owed and what's paid",
      icon: "invoice",
      onPress: sales("invoices"),
    }),
    ...when(has("quote.read"), {
      key: "quotes",
      title: "Quotes",
      subtitle: "Sent, accepted and declined",
      icon: "quote",
      onPress: sales("quotes"),
    }),
    ...when(has("contract.read"), {
      key: "contracts",
      title: "Contracts",
      subtitle: "Waiting for a signature and signed",
      icon: "contract",
      onPress: sales("contracts"),
    }),
  ]

  const workItems: Item[] = [
    ...when(has("client.read"), {
      key: "clients",
      title: "Clients",
      icon: "people",
      onPress: work("clients"),
    }),
    ...when(has("project.read"), {
      key: "projects",
      title: "Projects",
      icon: "folder",
      onPress: work("projects"),
    }),
    ...when(has("time.approve"), {
      key: "approvals",
      title: "Timesheet approvals",
      subtitle: "Weeks waiting for you",
      icon: "checklist",
      onPress: () => router.push("/approvals"),
    }),
  ]

  const youItems: Item[] = [
    {
      key: "account",
      title: session.data?.user.name || "Account",
      subtitle: "Appearance, notifications, reminder",
      icon: "user",
      onPress: () => router.push("/account"),
    },
    {
      key: "workspaces",
      title: "Workspaces",
      subtitle: workspace ? `In ${workspace.name}` : undefined,
      icon: "building",
      onPress: () => router.push("/workspaces"),
    },
  ]

  const askSignOut = async () => {
    const ok = await confirm({
      title: "Sign out?",
      message:
        "This phone forgets your session and its timer reminder, and stops getting notifications. Your data stays in Billleaf.",
      confirmLabel: "Sign out",
      destructive: true,
    })
    if (!ok) return
    setSigningOut(true)
    await signOut()
  }

  return (
    <View style={styles.flex}>
      <AppBar title="More" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + inset },
        ]}
      >
        <Group title="Sales" items={salesItems} />
        <Group title="Work" items={workItems} />
        <Group title="You" items={youItems} />
        <View style={styles.signOut}>
          <ListGroup>
            <ListItem
              title={signingOut ? "Signing out…" : "Sign out"}
              leading={<IconTile icon="logout" tone="out" />}
              onPress={signingOut ? undefined : askSignOut}
            />
          </ListGroup>
        </View>
      </ScrollView>
    </View>
  )
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null
  return (
    <View>
      <SectionHeader title={title} />
      <ListGroup>
        {items.map((i) => (
          <ListItem
            key={i.key}
            title={i.title}
            subtitle={i.subtitle}
            leading={<IconTile icon={i.icon} />}
            chevron
            onPress={i.onPress}
          />
        ))}
      </ListGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  signOut: { marginTop: Space[6] },
})
