/**
 * Trend prompts for leaders (§8.3, §8.5): worded as questions to look at,
 * never as verdicts about a person, and always with the numbers behind them.
 */
import { formatPercent, safeRatio } from "../utils/format";

export type Signal = {
  code: string;
  severity: "warning" | "info";
  now?: { num: number; den: number };
  before?: { num: number; den: number };
  employee_id?: string;
  name?: string;
  count?: number;
};

const rate = (x?: { num: number; den: number }) => (x ? `${formatPercent(safeRatio(x.num, x.den))} (${x.num} von ${x.den})` : "–");

export function signalText(s: Signal): string {
  switch (s.code) {
    case "contact_rate_down":
      return `Kontaktquote der letzten 30 Tage ${rate(s.now)} gegenüber ${rate(s.before)} davor – lohnt sich ein Blick auf die Erstkontakte?`;
    case "booking_rate_down":
      return `Terminquote ${rate(s.now)} gegenüber ${rate(s.before)} – gibt es neue Einwände oder andere Lead-Quellen?`;
    case "sla_breaches_up":
      return `Mehr Leads über der Erstkontakt-Frist: ${rate(s.now)} gegenüber ${rate(s.before)} – reicht die Kapazität?`;
    case "overdue_tasks":
      return `${s.name}: ${s.count} Aufgaben seit über zwei Tagen überfällig – Unterstützung oder Umverteilung sinnvoll?`;
    case "leads_without_next_step":
      return `${s.name}: ${s.count} kontaktierte Leads ohne geplanten nächsten Schritt – gemeinsam priorisieren?`;
    default:
      return s.code;
  }
}
