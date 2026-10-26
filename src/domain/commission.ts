import Decimal from "decimal.js";
import { toDecimal, type NumericInput } from "../utils/format";

/**
 * TypeScript mirror of app_private.commission_split (migration
 * 20261026200000_commission_rules.sql), for previews and the career/income
 * simulator. Booked commission always comes from the database ledger.
 * Shared golden cases: GC-COMM-xxx.
 *
 * Provisional differential rule (OD-05, "rate compression"): walking up the
 * chain, each ancestor earns max(0, own rate − highest rate paid so far).
 */

export type ChainMember = { id: string; rate: NumericInput | null };

export type CommissionEntry = {
  recipient: string;
  type: "personal" | "differential";
  depth: number;
  rate: Decimal;
  gross: Decimal;
  reserve: Decimal;
  net: Decimal;
};

const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

function amounts(points: Decimal, rate: Decimal, reserveRatio: Decimal) {
  const gross = round2(points.times(rate));
  const reserve = round2(gross.times(reserveRatio));
  return { gross, reserve, net: gross.minus(reserve) };
}

export function splitCommission(input: {
  points: NumericInput;
  producerId: string;
  producerRate: NumericInput;
  chain: ChainMember[];
  reserveRatio: NumericInput;
}): CommissionEntry[] {
  const points = toDecimal(input.points);
  const producerRate = toDecimal(input.producerRate);
  const reserveRatio = toDecimal(input.reserveRatio) ?? new Decimal(0);
  if (points === null || points.isZero() || producerRate === null) return [];

  const entries: CommissionEntry[] = [
    { recipient: input.producerId, type: "personal", depth: 0, rate: producerRate, ...amounts(points, producerRate, reserveRatio) },
  ];

  let paid = producerRate;
  input.chain.forEach((member, index) => {
    const rate = toDecimal(member.rate);
    if (rate === null) return;
    const diff = rate.minus(paid);
    if (diff.gt(0)) {
      entries.push({ recipient: member.id, type: "differential", depth: index + 1, rate: diff, ...amounts(points, diff, reserveRatio) });
      paid = rate;
    }
  });
  return entries;
}

/** Totals of a set of entries, as shown on a statement (§6.3). */
export function sumEntries(entries: Pick<CommissionEntry, "gross" | "reserve" | "net">[]) {
  return entries.reduce(
    (t, e) => ({ gross: t.gross.plus(e.gross), reserve: t.reserve.plus(e.reserve), net: t.net.plus(e.net) }),
    { gross: new Decimal(0), reserve: new Decimal(0), net: new Decimal(0) },
  );
}
