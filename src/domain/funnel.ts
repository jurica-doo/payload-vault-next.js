/**
 * Lead funnel presentation (§8.2, §9.4). Every rate is a pair of counts so
 * the UI can always show "x von y" next to the percentage.
 */
import { safeRatio } from "../utils/format";

export type FunnelTotals = {
  leads: number; contacted: number; reached: number; qualified: number; booked: number;
  held: number; offer: number; won: number; lost: number; open: number; unassigned: number;
};

export const FUNNEL_STEPS: { id: keyof FunnelTotals; label: string }[] = [
  { id: "leads", label: "Leads eingegangen" },
  { id: "contacted", label: "Kontakt versucht" },
  { id: "reached", label: "Erreicht" },
  { id: "booked", label: "Termin vereinbart" },
  { id: "held", label: "Termin durchgeführt" },
  { id: "offer", label: "Angebot" },
  { id: "won", label: "Gewonnen" },
];

export type Rate = { id: string; label: string; numerator: number; denominator: number; definition: string };

/** The four §9.4 rates with their explicit denominators. */
export function funnelRates(t: FunnelTotals): Rate[] {
  return [
    { id: "contact", label: "Kontaktquote", numerator: t.contacted, denominator: t.leads, definition: "Kontakt versucht ÷ Leads" },
    { id: "booking", label: "Terminquote", numerator: t.booked, denominator: t.reached, definition: "Termin vereinbart ÷ erreicht" },
    { id: "show", label: "Erscheinensquote", numerator: t.held, denominator: t.booked, definition: "Termin durchgeführt ÷ vereinbart" },
    { id: "conversion", label: "Abschlussquote", numerator: t.won, denominator: t.leads, definition: "Gewonnen ÷ Leads" },
  ];
}

export const rateValue = (r: Pick<Rate, "numerator" | "denominator">) => safeRatio(r.numerator, r.denominator);
