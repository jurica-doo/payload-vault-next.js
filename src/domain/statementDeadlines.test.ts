import { describe, expect, it } from "vitest";
import { statementDeadlines } from "./statementDeadlines";

describe("statementDeadlines", () => {
  it("gives 8 weeks for objections and 10 days for a debit balance", () => {
    expect(statementDeadlines("2026-12-03T09:15:00Z")).toEqual({
      availableOn: "2026-12-03",
      objectionUntil: "2027-01-28",
      debitDue: "2026-12-13",
    });
  });

  it("counts in Berlin days (late evening UTC is already the next day)", () => {
    expect(statementDeadlines("2026-12-03T23:30:00Z").availableOn).toBe("2026-12-04");
  });

  it("crosses month ends and leap days", () => {
    expect(statementDeadlines("2028-02-25T10:00:00Z").debitDue).toBe("2028-03-06");
  });
});
