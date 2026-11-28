import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Body,
  Button,
  KeyboardAvoid,
  PasswordField,
  Screen,
  TextField,
  Title,
} from "@/components/ui"
import { Spacing } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { ApiError, errorMessage } from "@/lib/api-error"
import { authClient } from "@/lib/auth-client"
import { WEB_URL } from "@/lib/config"

/**
 * Sign in with email and password, then a 6-digit code for accounts with
 * two-factor authentication. New accounts and password resets happen on
 * the web (opened in an in-app browser).
 */
type AuthError = { status?: number; message?: string | null }

/** A thrown fetch failure, as an auth error with no status. */
function thrown(e: unknown): AuthError {
  return { message: e instanceof Error ? e.message : null }
}

/**
 * The auth server's own message for a wrong password or code; plain words
 * for no connection, a server fault or too many tries.
 */
function authError(e: AuthError, fallback: string) {
  if (!e.status) return errorMessage(new Error(e.message ?? fallback))
  if (e.status >= 500 || e.status === 429)
    return errorMessage(new ApiError(e.status, {}))
  return e.message || fallback
}

export default function SignInScreen() {
  const t = useTheme()
  const [step, setStep] = React.useState<"password" | "code">("password")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [code, setCode] = React.useState("")
  // A backup code instead of the authenticator app (as on the web).
  const [backup, setBackup] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const signIn = async () => {
    setPending(true)
    setError(null)
    const { data, error } = await authClient.signIn
      .email({ email: email.trim(), password })
      .catch((e: unknown) => ({ data: null, error: thrown(e) }))
    setPending(false)
    if (error) {
      setError(
        error.status === 403
          ? "Verify your email first: open the link we sent you, then sign in."
          : authError(error, "Couldn't sign in")
      )
      return
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect)
      setStep("code")
  }

  const verify = async () => {
    setPending(true)
    setError(null)
    const input = { code: code.replace(/\s/g, ""), trustDevice: true }
    const { error } = await (
      backup
        ? authClient.twoFactor.verifyBackupCode(input)
        : authClient.twoFactor.verifyTotp(input)
    ).catch((e: unknown) => ({ error: thrown(e) }))
    setPending(false)
    if (error) setError(authError(error, "That code didn't work"))
  }

  const openWeb = (path: string) =>
    WebBrowser.openBrowserAsync(`${WEB_URL}${path}`)

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoid>
          {/* Insets, not KeyboardAvoidingView: its layout animation made the
            fields jump under your finger as the keyboard opened. */}
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
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
                  {backup
                    ? "Enter one of the backup codes you saved when you turned on two-factor. Each works once."
                    : "Enter the 6-digit code from your authenticator app."}
                </Body>
              ) : null}
            </View>

            {step === "password" ? (
              <View style={{ gap: Spacing.three }}>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <PasswordField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
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
                <TextField
                  key={backup ? "backup" : "totp"}
                  label={backup ? "Backup code" : "Code"}
                  value={code}
                  onChangeText={setCode}
                  keyboardType={backup ? "default" : "number-pad"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={backup ? "off" : "one-time-code"}
                  textContentType={backup ? "none" : "oneTimeCode"}
                  autoFocus
                  onSubmitEditing={verify}
                />
                {error ? (
                  <Body style={{ color: t.danger }}>{error}</Body>
                ) : null}
                <Button
                  title="Verify"
                  loading={pending}
                  disabled={
                    backup ? !code.trim() : code.replace(/\s/g, "").length < 6
                  }
                  onPress={verify}
                />
                <Button
                  title={
                    backup
                      ? "Use your authenticator app"
                      : "Use a backup code instead"
                  }
                  variant="link"
                  onPress={() => {
                    setBackup(!backup)
                    setCode("")
                    setError(null)
                  }}
                />
                <Button
                  title="Back"
                  variant="link"
                  onPress={() => {
                    setStep("password")
                    setBackup(false)
                    setCode("")
                    setError(null)
                  }}
                />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoid>
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
