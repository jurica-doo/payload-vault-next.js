import { describe, expect, it } from "vitest";
import { splitCommission, sumEntries, type ChainMember } from "./commission";

// Same cases and IDs as supabase/tests/080_commission_rules.test.sql.
const splitStr = (points: string | number, rate: string | number, chain: ChainMember[], ratio = "0.10") =>
  splitCommission({ points, producerId: "P", producerRate: rate, chain, reserveRatio: ratio })
    .map((e) => `${e.recipient}:${e.type}:${e.rate.toString()}:${e.gross.toFixed(2)}/${e.reserve.toFixed(2)}/${e.net.toFixed(2)}`)
    .join(", ");

describe("commission split — golden cases", () => {
  it.each([
    ["GC-COMM-001", splitStr(10, 56, []), "P:personal:56:560.00/56.00/504.00"],
    ["GC-COMM-002", splitStr(10, 28, [{ id: "FB", rate: "56" }]), "P:personal:28:280.00/28.00/252.00, FB:differential:28:280.00/28.00/252.00"],
    [
      "GC-COMM-003",
      splitStr(10, 28, [{ id: "FB", rate: "56" }, { id: "TL", rate: "70" }, { id: "DL", rate: "112" }]),
      "P:personal:28:280.00/28.00/252.00, FB:differential:28:280.00/28.00/252.00, TL:differential:14:140.00/14.00/126.00, DL:differential:42:420.00/42.00/378.00",
    ],
    ["GC-COMM-004", splitStr(10, 28, [{ id: "DL", rate: "112" }]), "P:personal:28:280.00/28.00/252.00, DL:differential:84:840.00/84.00/756.00"],
    ["GC-COMM-005", splitStr(10, 56, [{ id: "FB2", rate: "56" }, { id: "TL", rate: "70" }]), "P:personal:56:560.00/56.00/504.00, TL:differential:14:140.00/14.00/126.00"],
    ["GC-COMM-006", splitStr("0.0001", 56, []), "P:personal:56:0.01/0.00/0.01"],
    ["GC-COMM-007", splitStr("3.1415", 56, []), "P:personal:56:175.92/17.59/158.33"],
    ["GC-COMM-008", splitStr(0, 56, [{ id: "TL", rate: "70" }]), ""],
    ["GC-COMM-009", splitStr(-10, 28, [{ id: "FB", rate: "56" }]), "P:personal:28:-280.00/-28.00/-252.00, FB:differential:28:-280.00/-28.00/-252.00"],
    ["GC-COMM-010", splitStr(10, 70, [{ id: "FB", rate: "56" }, { id: "DL", rate: "112" }]), "P:personal:70:700.00/70.00/630.00, DL:differential:42:420.00/42.00/378.00"],
    ["GC-COMM-011", splitStr(10, 28, [{ id: "X", rate: null }, { id: "TL", rate: "70" }]), "P:personal:28:280.00/28.00/252.00, TL:differential:42:420.00/42.00/378.00"],
  ])("%s", (_id, actual, expected) => {
    expect(actual).toBe(expected);
  });
});

describe("commission split — properties", () => {
  it("never pays more than the top rate in total", () => {
    const entries = splitCommission({
      points: 10, producerId: "P", producerRate: 28, reserveRatio: 0,
      chain: [{ id: "FB", rate: 56 }, { id: "TL", rate: 70 }, { id: "OL", rate: 92 }, { id: "DL", rate: 112 }, { id: "RL", rate: 132 }, { id: "VD", rate: 144 }],
    });
    expect(sumEntries(entries).gross.toString()).toBe("1440");
  });

  it("gross = reserve + net for every entry", () => {
    for (const e of splitCommission({ points: "7.7777", producerId: "P", producerRate: 56, reserveRatio: "0.10", chain: [{ id: "TL", rate: 70 }] })) {
      expect(e.reserve.plus(e.net).equals(e.gross)).toBe(true);
    }
  });
});
