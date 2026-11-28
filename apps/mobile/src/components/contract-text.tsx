import { inlineRuns, parseContractText } from "@workspace/contracts"
import * as React from "react"
import { Linking, StyleSheet, View } from "react-native"

import { Text } from "@/components/ui"
import { Radius, Space, type TextVariant } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

const FIELD = /(\{\{\s*[a-z_.]+\s*\}\})/g
const IS_FIELD = /^\{\{\s*[a-z_.]+\s*\}\}$/

/** Bold, italic and links, and unresolved {{fields}} highlighted (as on the web). */
function Inline({ text, variant }: { text: string; variant: TextVariant }) {
  const t = useTheme()
  return (
    <>
      {inlineRuns(text).map((run, i) =>
        run.text.split(FIELD).map((part, j) =>
          part ? (
            <Text
              key={`${i}-${j}`}
              variant={variant}
              tone={run.href ? "primary" : "default"}
              onPress={
                run.href
                  ? () => Linking.openURL(run.href!).catch(() => {})
                  : undefined
              }
              accessibilityRole={run.href ? "link" : undefined}
              style={[
                styles.line,
                run.bold && styles.bold,
                run.italic && styles.italic,
                run.href && styles.link,
                IS_FIELD.test(part) && {
                  backgroundColor: t.warningSoft,
                  color: t.warning,
                },
              ]}
            >
              {part}
            </Text>
          ) : null
        )
      )}
    </>
  )
}

/**
 * Contract text drawn the way the PDF and the web draw it: headings,
 * bulleted and numbered lists, and paragraphs. Selectable, for copying.
 */
export function ContractText({ text }: { text: string }) {
  const t = useTheme()
  const blocks = parseContractText(text)
  if (blocks.length === 0)
    return (
      <Text variant="body" tone="muted">
        Nothing written yet.
      </Text>
    )
  return (
    <View style={styles.gap}>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const variant: TextVariant = b.level === 1 ? "headline" : "bodyStrong"
          return (
            <Text
              key={i}
              variant={variant}
              accessibilityRole="header"
              selectable
              style={i > 0 && styles.headingGap}
            >
              <Inline text={b.text} variant={variant} />
            </Text>
          )
        }
        if (b.type === "rule")
          return (
            <View
              key={i}
              style={[styles.rule, { backgroundColor: t.border }]}
            />
          )
        if (b.type === "list")
          return (
            <View key={i} style={styles.list}>
              {b.items.map((item, j) => (
                <View key={j} style={styles.item}>
                  <Text
                    variant="body"
                    tone="muted"
                    style={[styles.line, styles.marker]}
                    numeric
                  >
                    {b.ordered ? `${j + 1}.` : "•"}
                  </Text>
                  <Text
                    variant="body"
                    style={[styles.line, styles.flex]}
                    selectable
                  >
                    <Inline text={item} variant="body" />
                  </Text>
                </View>
              ))}
            </View>
          )
        return (
          <Text key={i} variant="body" style={styles.line} selectable>
            <Inline text={b.text} variant="body" />
          </Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Space[3] },
  bold: { fontWeight: "600" },
  italic: { fontStyle: "italic" },
  link: { textDecorationLine: "underline" },
  rule: {
    height: StyleSheet.hairlineWidth * 2,
    marginVertical: Space[1],
    borderRadius: Radius.xs,
  },
  line: { lineHeight: 24 },
  headingGap: { marginTop: Space[2] },
  list: { gap: Space[1] },
  item: { flexDirection: "row", gap: Space[2] },
  marker: { minWidth: 18 },
})
