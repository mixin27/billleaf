import { useQuery } from "@tanstack/react-query"
import { PLANS } from "@workspace/contracts"
import * as React from "react"
import { StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Body, Button, Screen, Title } from "@/components/ui"
import { Spacing } from "@/constants/theme"
import { api, errorMessage, setApiWorkspace, unwrap } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { queryClient } from "@/lib/query-client"

/**
 * Placeholder home: proves the session works against the API (`/v1/me` in
 * your first workspace). The workspace picker and dashboard come next.
 */
export default function HomeScreen() {
  const session = authClient.useSession()
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const { data, error } = await authClient.organization.list()
      if (error) throw new Error(error.message ?? "Couldn't load workspaces")
      return data ?? []
    },
  })
  const first = workspaces.data?.[0]
  const me = useQuery({
    queryKey: ["me", first?.id],
    enabled: Boolean(first),
    queryFn: () => {
      setApiWorkspace(first!.id)
      return unwrap(api.GET("/v1/me"))
    },
  })
  const [signingOut, setSigningOut] = React.useState(false)

  return (
    <Screen>
      <SafeAreaView style={styles.content}>
        <Title>Hi, {session.data?.user.name?.split(" ")[0] ?? "there"}</Title>
        <Body muted>{session.data?.user.email}</Body>
        <View style={styles.card}>
          {workspaces.isPending || me.isPending ? (
            <Body muted>Loading your workspace…</Body>
          ) : workspaces.error || me.error ? (
            <Body>{errorMessage(workspaces.error ?? me.error)}</Body>
          ) : first ? (
            <Body>
              {me.data?.workspace?.name ?? first.name} ·{" "}
              {me.data ? PLANS[me.data.plan.key].name : ""} plan
            </Body>
          ) : (
            <Body muted>No workspace yet: create one on the web.</Body>
          )}
        </View>
        <Button
          title="Sign out"
          variant="secondary"
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true)
            await authClient.signOut()
            setApiWorkspace(null)
            queryClient.clear()
          }}
        />
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  card: { paddingVertical: Spacing.three },
})
