import { inlineRuns, parseContractText } from "@workspace/contracts"
import * as React from "react"
import { StyleSheet, Text, View } from "react-native"

import { Spacing, Type } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

const FIELD = /(\{\{\s*[a-z_.]+\s*\}\})/g
const IS_FIELD = /^\{\{\s*[a-z_.]+\s*\}\}$/

/** **bold** spans, and unresolved {{fields}} highlighted (as on the web). */
function Inline({ text }: { text: string }) {
  const t = useTheme()
  return (
    <>
      {inlineRuns(text).map((run, i) =>
        run.text.split(FIELD).map((part, j) =>
          part ? (
            <Text
              key={`${i}-${j}`}
              style={[
                run.bold && styles.bold,
                IS_FIELD.test(part) && {
                  backgroundColor: t.warningBackground,
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
      <Text style={[Type.body, { color: t.textSecondary }]}>
        Nothing written yet.
      </Text>
    )
  const body = [Type.body, styles.line, { color: t.text }]
  return (
    <View style={styles.gap}>
      {blocks.map((b, i) => {
        if (b.type === "heading")
          return (
            <Text
              key={i}
              accessibilityRole="header"
              selectable
              style={[
                b.level === 1 ? Type.heading : Type.body,
                styles.bold,
                i > 0 && styles.headingGap,
                { color: t.text },
              ]}
            >
              <Inline text={b.text} />
            </Text>
          )
        if (b.type === "list")
          return (
            <View key={i} style={styles.list}>
              {b.items.map((item, j) => (
                <View key={j} style={styles.item}>
                  <Text style={[body, styles.marker]}>
                    {b.ordered ? `${j + 1}.` : "•"}
                  </Text>
                  <Text style={[body, styles.flex]} selectable>
                    <Inline text={item} />
                  </Text>
                </View>
              ))}
            </View>
          )
        return (
          <Text key={i} style={body} selectable>
            <Inline text={b.text} />
          </Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Spacing.three },
  bold: { fontWeight: "600" },
  line: { lineHeight: 23 },
  headingGap: { marginTop: Spacing.two },
  list: { gap: Spacing.one },
  item: { flexDirection: "row", gap: Spacing.two },
  marker: { minWidth: 18 },
})
