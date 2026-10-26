import { describe, expect, it } from "vitest";
import { FUNNEL_STEPS, funnelRates, rateValue, type FunnelTotals } from "./funnel";

const t: FunnelTotals = { leads: 4, contacted: 3, reached: 2, qualified: 2, booked: 2, held: 1, offer: 1, won: 1, lost: 1, open: 2, unassigned: 0 };

describe("funnelRates", () => {
  it("pairs every rate with its denominator", () => {
    const r = Object.fromEntries(funnelRates(t).map((x) => [x.id, x]));
    expect([r.contact.numerator, r.contact.denominator]).toEqual([3, 4]);
    expect([r.booking.numerator, r.booking.denominator]).toEqual([2, 2]);
    expect([r.show.numerator, r.show.denominator]).toEqual([1, 2]);
    expect(rateValue(r.conversion)?.toNumber()).toBe(0.25);
  });
  it("a zero denominator gives no rate instead of NaN", () => {
    const zero = funnelRates({ ...t, leads: 0, contacted: 0 });
    expect(rateValue(zero[0])).toBeNull();
  });
  it("funnel steps are in pipeline order", () => {
    expect(FUNNEL_STEPS.map((s) => s.id)).toEqual(["leads", "contacted", "reached", "booked", "held", "offer", "won"]);
  });
});
