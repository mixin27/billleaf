import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { localParts, zonedToUtc } from "../../common/time-zone.js"
import {
  ClockifyFormatError,
  guessDateFormat,
  parseClockifyCsv,
  parseCsv,
  parseDate,
  parseTime,
} from "./clockify-csv.js"

const fixture = readFileSync(
  new URL("../../../test/fixtures/clockify-detailed.csv", import.meta.url),
  "utf8"
)

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ])
    expect(parseCsv('"multi\nline",x')).toEqual([["multi\nline", "x"]])
    expect(parseCsv("a;b\n1;2", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })
})

describe("dates and times", () => {
  it("parses the formats Clockify exports", () => {
    expect(parseDate("11/03/2026", "MDY")).toBe("2026-11-03")
    expect(parseDate("03/11/2026", "DMY")).toBe("2026-11-03")
    expect(parseDate("03.11.2026", "DMY")).toBe("2026-11-03")
    expect(parseDate("2026-11-03", "MDY")).toBe("2026-11-03")
    expect(() => parseDate("02/30/2026", "MDY")).toThrow()
    expect(parseTime("09:05:00 AM")).toBe("09:05:00")
    expect(parseTime("12:00:00 AM")).toBe("00:00:00")
    expect(parseTime("12:30 PM")).toBe("12:30:00")
    expect(parseTime("11:00:00 p.m.")).toBe("23:00:00")
    expect(parseTime("17:45")).toBe("17:45:00")
    expect(() => parseTime("25:00")).toThrow()
  })

  it("guesses day-first only when the file proves it", () => {
    expect(guessDateFormat(["03/04/2026"])).toBe("MDY")
    expect(guessDateFormat(["03/04/2026", "25/04/2026"])).toBe("DMY")
    expect(guessDateFormat(["04/25/2026"])).toBe("MDY")
    expect(guessDateFormat(["2026-04-25"])).toBe("YMD")
  })
})

describe("parseClockifyCsv", () => {
  it("reads the detailed report and reports bad rows by line", () => {
    const r = parseClockifyCsv(fixture)
    expect(r.dateFormat).toBe("MDY")
    expect(r.rows).toHaveLength(4)
    expect(r.invalid).toEqual([
      { line: 6, message: 'Unreadable date "11/31/2026"' },
    ])
    expect(r.rows[0]).toMatchObject({
      project: "Brand refresh",
      client: "Northwind",
      task: "Sketching",
      tags: ["Design", "Deep work"],
      billable: true,
      startDate: "2026-11-03",
      startTime: "09:00:00",
      endTime: "11:30:00",
    })
    expect(r.rows[2]).toMatchObject({
      project: null,
      description: 'Admin, "inbox" and invoices',
      billable: false,
      tags: [],
    })
    // Crosses midnight.
    expect(r.rows[3]).toMatchObject({
      email: "sam@elsewhere.test",
      startDate: "2026-11-04",
      endDate: "2026-11-05",
      endTime: "01:00:00",
    })
  })

  it("falls back to the duration column", () => {
    const r = parseClockifyCsv(
      "Description,Start Date,Start Time,Duration (h)\nX,2026-01-02,23:30,01:00:00\n"
    )
    expect(r.rows[0]).toMatchObject({
      endDate: "2026-01-03",
      endTime: "00:30:00",
    })
  })

  it("rejects files that aren't a detailed report", () => {
    expect(() => parseClockifyCsv("Name,Amount\nA,1\n")).toThrow(
      ClockifyFormatError
    )
  })
})

describe("time zones", () => {
  it("converts wall-clock time to UTC and back, across DST", () => {
    expect(
      zonedToUtc("2026-07-01", "09:00:00", "Europe/Berlin").toISOString()
    ).toBe("2026-07-01T07:00:00.000Z")
    expect(
      zonedToUtc("2026-01-01", "09:00:00", "Europe/Berlin").toISOString()
    ).toBe("2026-01-01T08:00:00.000Z")
    expect(
      zonedToUtc("2026-11-03", "09:00:00", "Asia/Yangon").toISOString()
    ).toBe("2026-11-03T02:30:00.000Z")
    expect(localParts(new Date("2026-11-03T02:30:00Z"), "Asia/Yangon")).toEqual(
      { date: "2026-11-03", time: "09:00:00" }
    )
  })
})
