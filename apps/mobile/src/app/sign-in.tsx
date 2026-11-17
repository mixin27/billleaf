import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Body, Button, Field, Screen, Title } from "@/components/ui"
import { Spacing } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { authClient } from "@/lib/auth-client"
import { WEB_URL } from "@/lib/config"

/**
 * Sign in with email and password, then a 6-digit code for accounts with
 * two-factor authentication. New accounts and password resets happen on
 * the web (opened in an in-app browser).
 */
export default function SignInScreen() {
  const t = useTheme()
  const [step, setStep] = React.useState<"password" | "code">("password")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const signIn = async () => {
    setPending(true)
    setError(null)
    const { data, error } = await authClient.signIn.email({
      email: email.trim(),
      password,
    })
    setPending(false)
    if (error) {
      setError(
        error.status === 403
          ? "Verify your email first: open the link we sent you, then sign in."
          : (error.message ?? "Couldn't sign in")
      )
      return
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect)
      setStep("code")
  }

  const verify = async () => {
    setPending(true)
    setError(null)
    const { error } = await authClient.twoFactor.verifyTotp({
      code: code.replace(/\s/g, ""),
      trustDevice: true,
    })
    setPending(false)
    if (error) setError(error.message ?? "That code didn't work")
  }

  const openWeb = (path: string) =>
    WebBrowser.openBrowserAsync(`${WEB_URL}${path}`)

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: Spacing.one }}>
              <Body style={[styles.wordmark, { color: t.primary }]}>
                billleaf
              </Body>
              <Title>
                {step === "password" ? "Sign in" : "Two-factor authentication"}
              </Title>
              {step === "code" ? (
                <Body muted>
                  Enter the 6-digit code from your authenticator app.
                </Body>
              ) : null}
            </View>

            {step === "password" ? (
              <View style={{ gap: Spacing.three }}>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  onSubmitEditing={signIn}
                />
                {error ? (
                  <Body style={{ color: t.danger }}>{error}</Body>
                ) : null}
                <Button
                  title="Sign in"
                  loading={pending}
                  disabled={!email.trim() || !password}
                  onPress={signIn}
                />
                <Button
                  title="Forgot password?"
                  variant="link"
                  onPress={() =>
                    openWeb(
                      `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`
                    )
                  }
                />
                <Button
                  title="Create an account"
                  variant="secondary"
                  onPress={() => openWeb("/sign-up")}
                />
              </View>
            ) : (
              <View style={{ gap: Spacing.three }}>
                <Field
                  label="Code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  autoFocus
                  onSubmitEditing={verify}
                />
                {error ? (
                  <Body style={{ color: t.danger }}>{error}</Body>
                ) : null}
                <Button
                  title="Verify"
                  loading={pending}
                  disabled={code.replace(/\s/g, "").length < 6}
                  onPress={verify}
                />
                <Button
                  title="Back"
                  variant="link"
                  onPress={() => {
                    setStep("password")
                    setCode("")
                    setError(null)
                  }}
                />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  wordmark: { fontSize: 22, fontWeight: "700" },
})
