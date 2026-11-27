import { describe, expect, it } from "vitest"

import {
  CashbookCsvFormatError,
  importKeys,
  parseCashbookCsv,
  parseCashbookDate,
  parseCashbookTime,
} from "./cashbook-csv.js"

const HEADER = `"Date","Time","Remark","Entry by","Contact","Mode","Cash In","Cash Out","Balance"`
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n")

describe("parseCashbookDate", () => {
  it.each([
    ["04 May 2026", "2026-05-04"],
    ["4 May 2026", "2026-05-04"],
    ["21 Sept 2026", "2026-09-21"],
    ["1 December, 2025", "2025-12-01"],
    ["2026-05-04", "2026-05-04"],
  ])("%s → %s", (v, out) => expect(parseCashbookDate(v)).toBe(out))

  it.each(["31 Feb 2026", "May 4 2026", "04/05/2026", ""])("rejects %s", (v) =>
    expect(parseCashbookDate(v)).toBeNull()
  )
})

describe("parseCashbookTime", () => {
  it.each([
    ["12:47 pm", "12:47"],
    ["5:03 pm", "17:03"],
    ["12:05 am", "00:05"],
    ["9:30 AM", "09:30"],
    ["17:03", "17:03"],
    ["08:15:59", "08:15"],
  ])("%s → %s", (v, out) => expect(parseCashbookTime(v)).toBe(out))

  it.each(["13:00 pm", "24:00", "7 pm", "9:61"])("rejects %s", (v) =>
    expect(parseCashbookTime(v)).toBeNull()
  )
})

describe("parseCashbookCsv", () => {
  it("reads a CashBook export in whole kyat", () => {
    const { rows, invalid } = parseCashbookCsv(
      csv(
        `"04 May 2026","12:47 pm","","Aye Aye","Ko Ko","Online",5000000,,5000000`,
        `"04 May 2026","7:19 pm","Rent","Aye Aye","","Cash",,2000000,3000000`
      ),
      "MMK"
    )
    expect(invalid).toEqual([])
    expect(rows).toEqual([
      {
        line: 2,
        entryDate: "2026-05-04",
        entryTime: "12:47",
        type: "in",
        amount: 500000000,
        remark: null,
        contactName: "Ko Ko",
        mode: "Online",
        category: null,
        entryBy: "Aye Aye",
        balance: 500000000,
      },
      expect.objectContaining({
        line: 3,
        entryTime: "19:19",
        type: "out",
        amount: 200000000,
        remark: "Rent",
        contactName: null,
        mode: "Cash",
        balance: 300000000,
      }),
    ])
  })

  it("finds columns by name, including Category, in any order", () => {
    const { rows } = parseCashbookCsv(
      [
        `Cash Out,Cash In,Category,Date,Time,Remark`,
        `,"1,500.50",Sales,10 May 2026,9:00 am,Till`,
      ].join("\r\n"),
      "USD"
    )
    expect(rows[0]).toMatchObject({
      type: "in",
      amount: 150050,
      category: "Sales",
      entryTime: "09:00",
      balance: null,
    })
  })

  it("reports rows it can't read, with their line", () => {
    const { rows, invalid } = parseCashbookCsv(
      csv(
        `"31 Feb 2026","1:00 pm","","","","",100,,100`,
        `"01 Mar 2026","1:00 pm","","","","",100,50,50`,
        `"01 Mar 2026","1:00 pm","","","","",,,50`,
        `"01 Mar 2026","1:00 pm","","","","",1.5,,50`,
        `"01 Mar 2026","noon","","","","",1,,50`
      ),
      "MMK"
    )
    expect(rows).toEqual([])
    expect(invalid).toEqual([
      { line: 2, message: `Unreadable date "31 Feb 2026"` },
      { line: 3, message: "Both Cash In and Cash Out are filled" },
      { line: 4, message: "No amount in Cash In or Cash Out" },
      { line: 5, message: "Unreadable amount" },
      { line: 6, message: `Unreadable time "noon"` },
    ])
  })

  it("rejects a file that isn't a CashBook export", () => {
    expect(() => parseCashbookCsv("Name,Email\nA,b@c.d", "MMK")).toThrow(
      CashbookCsvFormatError
    )
  })
})

describe("importKeys", () => {
  const parse = (...lines: string[]) =>
    parseCashbookCsv(csv(...lines), "MMK").rows

  it("is stable across imports of the same file", () => {
    const lines = [
      `"04 May 2026","12:47 pm","","A","B","Cash",100,,100`,
      `"05 May 2026","1:00 pm","x","A","","Cash",,40,60`,
    ]
    expect(importKeys(parse(...lines))).toEqual(importKeys(parse(...lines)))
  })

  it("keeps identical rows apart", () => {
    const row = `"04 May 2026","12:47 pm","Tea","A","","Cash",100,,100`
    const keys = importKeys(parse(row, row))
    expect(new Set(keys).size).toBe(2)
  })

  it("matches the earlier rows when a later export has more", () => {
    const a = `"04 May 2026","12:47 pm","","A","","Cash",100,,100`
    const b = `"05 May 2026","12:47 pm","","A","","Cash",,30,70`
    const [ka] = importKeys(parse(a))
    expect(importKeys(parse(a, b))[0]).toBe(ka)
  })
})
