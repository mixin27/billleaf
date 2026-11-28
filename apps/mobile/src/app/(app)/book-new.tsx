import { router } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  Chip,
  KeyboardAvoid,
  SheetFooter,
  SheetHeader,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
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
          toast.success(`${book.name} added`)
          router.back()
          router.push({ pathname: "/book/[id]", params: { id: book.id } })
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader title="New book" onClose={() => router.back()} />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.group}>
            <TextField
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

          <View style={styles.group}>
            <Text variant="label" tone="muted">
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
            <TextField
              label="Other currency"
              value={currencies.includes(code) ? "" : code}
              onChangeText={(v) => setCurrency(v.toUpperCase())}
              placeholder="3-letter code"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
              error={codeError}
              hint="Every entry in the book uses its currency. It can't change once the book has entries."
            />
          </View>
        </ScrollView>
        <SheetFooter>
          <Button
            title="Add book"
            loading={create.isPending}
            onPress={submit}
          />
        </SheetFooter>
      </KeyboardAvoid>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[5], paddingBottom: Space[8] },
  group: { gap: Space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
})
