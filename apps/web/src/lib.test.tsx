import { describe, expect, it } from "vitest";
import { cents, dateBr, money } from "./lib";

describe("Brazilian presentation helpers", () => {
  it("converts decimal input to integer cents", () => {
    expect(cents("1.234,56")).toBe(123456);
    expect(cents("10,01")).toBe(1001);
  });

  it("formats values and ISO dates", () => {
    expect(money(123456)).toContain("1.234,56");
    expect(dateBr("2026-10-01")).toBe("01/10/2026");
  });
});
