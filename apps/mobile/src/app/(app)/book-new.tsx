import { router } from "expo-router"
import * as React from "react"
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Body,
  Button,
  Chip,
  Field,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import { useCreateCashbook } from "@/features/cashbook"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { BOOK_NAME_IDEAS } from "@/lib/cashbook"

const COMMON = ["MMK", "USD", "THB", "SGD", "EUR"]

/** Name a new book and pick its currency (fixed once it has entries). */
export default function NewBookScreen() {
  const t = useTheme()
  const profile = useWorkspaceProfile()
  const create = useCreateCashbook()
  const fallback = profile.data?.defaultCurrency ?? "USD"
  const [name, setName] = React.useState("")
  const [currency, setCurrency] = React.useState<string | null>(null)
  const [touched, setTouched] = React.useState(false)
  const code = (currency ?? fallback).toUpperCase()
  const currencies = [fallback, ...COMMON.filter((c) => c !== fallback)]
  const nameError = touched && !name.trim() ? "Give the book a name" : undefined
  const codeError =
    touched && !/^[A-Z]{3}$/.test(code)
      ? "Use a 3-letter code, like MMK"
      : undefined

  const submit = () => {
    setTouched(true)
    if (!name.trim() || !/^[A-Z]{3}$/.test(code)) return
    create.mutate(
      { name: name.trim(), currency: code },
      {
        onSuccess: (book) => {
          router.back()
          router.push({ pathname: "/book/[id]", params: { id: book.id } })
        },
        onError: (e) => Alert.alert("Couldn't add the book", errorMessage(e)),
      }
    )
  }

  return (
    <Screen>
      <SafeAreaView
        style={styles.flex}
        edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      >
        <KeyboardAvoid>
          <View style={styles.header}>
            <Title>Add new book</Title>
            <Button
              title="Cancel"
              variant="link"
              onPress={() => router.back()}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.gap}>
              <Field
                label="Book name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Shop, Home, November"
                autoFocus
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={submit}
                error={nameError}
              />
              <View style={styles.wrap}>
                {BOOK_NAME_IDEAS.map((idea) => (
                  <Chip
                    key={idea}
                    label={idea}
                    selected={name === idea}
                    onPress={() => setName(idea)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.gap}>
              <Text style={[Type.small, styles.label, { color: t.text }]}>
                Currency
              </Text>
              <View style={styles.wrap}>
                {currencies.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    selected={code === c}
                    onPress={() => setCurrency(c)}
                  />
                ))}
              </View>
              <Field
                label="Other currency"
                value={currencies.includes(code) ? "" : code}
                onChangeText={(v) => setCurrency(v.toUpperCase())}
                placeholder="3-letter code"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={3}
                error={codeError}
              />
              <Body muted style={Type.small}>
                All entries in a book use its currency. It can't change once the
                book has entries.
              </Body>
            </View>

            <Button
              title="Add book"
              loading={create.isPending}
              onPress={submit}
            />
          </ScrollView>
        </KeyboardAvoid>
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  content: { padding: Spacing.four, gap: Spacing.four },
  gap: { gap: Spacing.two },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  label: { fontWeight: "600" },
})
