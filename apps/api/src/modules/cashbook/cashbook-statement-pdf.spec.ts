import { writeFileSync } from "node:fs"

import type { CashbookEntry, CashbookReport } from "@workspace/contracts"
import { describe, expect, it } from "vitest"

import { filterLabel } from "./cashbook-reports.service.js"
import {
  type CashbookStatementData,
  periodLabel,
  renderCashbookStatementPdf,
} from "./cashbook-statement-pdf.js"

function entry(
  i: number,
  over: Partial<CashbookEntry> & Pick<CashbookEntry, "type" | "amount">
): CashbookEntry {
  return {
    id: `e${i}`,
    bookId: "b",
    entryDate: "2026-05-04",
    entryTime: "12:47",
    remark: null,
    contactName: null,
    categoryId: null,
    categoryName: null,
    modeId: null,
    modeName: "Cash",
    balance: 0,
    createdBy: { memberId: "m", name: "Aye Aye", you: true },
    editable: true,
    edited: false,
    attachments: [],
    createdAt: "2026-05-04T06:17:00.000Z",
    updatedAt: "2026-05-04T06:17:00.000Z",
    ...over,
  }
}

/** Running balances from an opening balance, like the API returns them. */
function withBalances(entries: CashbookEntry[], opening = 0) {
  let b = opening
  return entries.map((e) => {
    b += e.type === "in" ? e.amount : -e.amount
    return { ...e, balance: b }
  })
}

function reportOf(
  entries: CashbookEntry[],
  opening = 0,
  range: { from?: string; to?: string } = {}
): CashbookReport {
  const totalIn = entries
    .filter((e) => e.type === "in")
    .reduce((s, e) => s + e.amount, 0)
  const totalOut = entries
    .filter((e) => e.type === "out")
    .reduce((s, e) => s + e.amount, 0)
  return {
    from: range.from ?? null,
    to: range.to ?? null,
    currency: "MMK",
    openingBalance: opening,
    totalIn,
    totalOut,
    closingBalance: opening + totalIn - totalOut,
    byDay: [],
    byCategory: [],
    byMode: [],
  }
}

const base = (over: Partial<CashbookStatementData>): CashbookStatementData => ({
  book: {
    name: "Shop",
    currency: "MMK",
    fields: { contact: true, category: true, mode: true },
  },
  entries: [],
  report: reportOf([]),
  filterLabel: null,
  workspaceName: "Aye Aye Trading",
  generatedBy: "Aye Aye",
  generatedAt: new Date("2026-11-27T14:00:00Z"),
  timezone: "Asia/Yangon",
  locale: "en-GB",
  brandColor: null,
  logo: null,
  cjk: null,
  ...over,
})

/** Set STATEMENT_PDF_OUT=/some/dir to keep the rendered samples. */
const keep = (name: string, pdf: Buffer) => {
  const dir = process.env.STATEMENT_PDF_OUT
  if (dir) writeFileSync(`${dir}/${name}.pdf`, pdf)
}

const pages = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length

describe("cashbook statement PDF", () => {
  it("renders a short book with Myanmar text on one page", async () => {
    const entries = withBalances([
      entry(1, {
        type: "in",
        amount: 5_000_000_00,
        contactName: "Ko Ko",
        modeName: "Online",
      }),
      entry(2, {
        type: "in",
        amount: 4_552_000_00,
        entryTime: "17:03",
        contactName: "Ko Ko",
        modeName: "Online",
      }),
      entry(3, {
        type: "out",
        amount: 2_000_000_00,
        entryTime: "19:19",
        contactName: "မေမေ",
      }),
      entry(4, {
        type: "out",
        amount: 4_910_000_00,
        entryDate: "2026-05-10",
        entryTime: "22:08",
        remark: "Apartment repair",
        categoryName: "Repairs",
      }),
      entry(5, {
        type: "out",
        amount: 200_000_00,
        entryDate: "2026-05-21",
        entryTime: "13:59",
        remark: "အဝတ်လျှော်စက် ပြင်ခ (washing machine repair)",
        categoryName: "Repairs",
      }),
    ])
    const pdf = await renderCashbookStatementPdf(
      base({ entries, report: reportOf(entries) })
    )
    keep("short", pdf)
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF")
    expect(pages(pdf)).toBe(1)
  })

  it("spans pages with an opening balance, filters and a brand colour", async () => {
    const entries = withBalances(
      Array.from({ length: 70 }, (_, i) =>
        entry(i, {
          type: i % 3 ? "out" : "in",
          amount: (i % 3 ? 12_500 : 90_000) * 100,
          entryDate: `2026-05-${String(1 + (i % 31)).padStart(2, "0")}`,
          remark:
            i % 7 === 0
              ? "Restock rice, oil and onions for the weekend market"
              : `Sale ${i}`,
        })
      ),
      1_250_000_00
    )
    const pdf = await renderCashbookStatementPdf(
      base({
        book: {
          name: "Corner shop",
          currency: "MMK",
          fields: { contact: false, category: false, mode: true },
        },
        entries,
        report: reportOf(entries, 1_250_000_00, {
          from: "2026-05-01",
          to: "2026-05-31",
        }),
        filterLabel: "Mode: Cash",
        brandColor: "#1D4ED8",
      })
    )
    keep("long", pdf)
    expect(pages(pdf)).toBeGreaterThan(1)
  })

  it("names whole months and single days", () => {
    expect(periodLabel("2026-05-01", "2026-05-31", "en-GB")).toBe("May 2026")
    expect(periodLabel("2026-02-01", "2026-02-28", "en-GB")).toBe(
      "February 2026"
    )
    expect(periodLabel("2026-05-04", "2026-05-04", "en-GB")).toBe("4 May 2026")
    expect(periodLabel("2026-05-04", "2026-05-21", "en-GB")).toBeNull()
    expect(periodLabel(null, null, "en-GB")).toBeNull()
  })

  it("puts non-date filters into words", () => {
    const e = [entry(1, { type: "out", amount: 1, modeName: "KBZPay" })]
    expect(filterLabel({ from: "2026-05-01" }, e)).toBeNull()
    expect(
      filterLabel(
        {
          type: "out",
          modeId: "00000000-0000-4000-8000-000000000001",
          q: "rice",
        },
        e
      )
    ).toBe('Cash out only · Mode: KBZPay · Search: "rice"')
  })
})
