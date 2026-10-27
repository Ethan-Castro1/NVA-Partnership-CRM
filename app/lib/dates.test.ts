import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate, schoolToday, toIsoDate } from "./dates";

describe("schoolToday", () => {
  it("is today in Annapolis, not on the server's clock", () => {
    // 02:30 UTC on Oct 23 is still the evening of Oct 22 in New York (EDT, UTC-4).
    expect(schoolToday(new Date("2026-10-23T02:30:00Z"))).toBe("2026-10-22");
    expect(schoolToday(new Date("2026-10-23T04:30:00Z"))).toBe("2026-10-23");
    // In winter (EST, UTC-5) the line moves by an hour.
    expect(schoolToday(new Date("2026-12-01T04:30:00Z"))).toBe("2026-11-30");
    expect(schoolToday(new Date("2026-12-01T05:30:00Z"))).toBe("2026-12-01");
    expect(schoolToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDays", () => {
  it("moves across months, years and the DST change", () => {
    expect(addDays("2026-10-27", 5)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-10-27", 0)).toBe("2026-10-27");
  });

  it("refuses something that isn't a date", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
    expect(() => addDays("tomorrow", 1)).toThrow(RangeError);
  });
});

describe("date helpers", () => {
  it("checks, compares and reads dates", () => {
    expect(isIsoDate("2026-10-27")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate(20261027)).toBe(false);
    expect(daysBetween("2026-10-27", "2026-11-03")).toBe(7);
    expect(daysBetween("2026-10-27", "2026-10-20")).toBe(-7);
    expect(toIsoDate(new Date("2026-10-27T00:00:00Z"))).toBe("2026-10-27");
    expect(toIsoDate("2026-10-27")).toBe("2026-10-27");
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("soon")).toBeNull();
  });
});
