import { describe, expect, it } from "vitest";
import { ledgerCsv, overviewCsv } from "./statementCsv";
import type { LedgerEntry, OverviewRow } from "../../hooks/useCommission/useCommission";

describe("statement CSV", () => {
  it("writes German decimals and keeps negative reversals numeric", () => {
    const csv = ledgerCsv([
      { production_date: "2026-03-01", producer_name: "Anna FA", category_code: "KV", commission_type: "differential",
        relationship: "direct", entry_kind: "reversal", points: -10, rate_per_point: 28, gross_amount: -280, reserve_amount: -28, net_after_reserve: -252 } as unknown as LedgerEntry,
    ]);
    const [, row] = csv.split("\r\n");
    expect(row).toBe("2026-03-01;Anna FA;KV;Differenz;direct;Rückbuchung;-10;28;-280;-28;-252");
  });

  it("guards text cells against formula injection", () => {
    const csv = overviewCsv([{ recipient_id: "x", recipient_name: "=HYPERLINK(1)", employee_no: "P1", gross: 1.5, reserve: 0.15, net: 1.35, entries: 1, subsidy: null } as OverviewRow]);
    expect(csv.split("\r\n")[1]).toBe("P1;'=HYPERLINK(1);1;1,5;0,15;1,35;");
  });
});
