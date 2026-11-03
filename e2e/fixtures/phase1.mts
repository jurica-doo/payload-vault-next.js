// Phase 1 test data: the people, the structure and the production that make
// the spec's worked examples (§14.1, §14.4, §4.5) visible on screen.
// The fill script creates exactly this; tests assert against the same numbers.

export const START_DATE = "2026-01-01";

/** Accounts from supabase/seeds/local_dev.sql (exist after `supabase db reset`). */
export const SEED = {
  admin: "admin@test.com", // Erika Mustermann, admin, TL, top of her own structure
  user: "user@test.com", // Max Mustermann, FA under Erika
  vault: "vault@test.com", // vault only, no employee record
} as const;

export type Level = "FA" | "FB" | "TL" | "OL" | "DL" | "RL" | "VD";

export type CastMember = {
  email: string;
  first: string;
  last: string;
  employeeNo: string;
  level: Level | null;
  manager: string | null; // manager's email; null = top of a structure
  roles?: ("finance" | "compliance")[];
  login: boolean; // false = invited only, never accepted
  inactive?: boolean;
  totp?: boolean; // enrol a TOTP factor (needed for admin/finance writes)
};

// Structure today:
//   Dora (DL)
//   ├─ Tim (TL) ───── §4.5: target OL, two structures, one capped
//   │  ├─ Anna (FB)   structure A: 800 P / 80 KV-P
//   │  │  └─ Ali (FA) planned transfer to Ben on 2027-06-01
//   │  └─ Ben (FB)    structure B: 300 P / 40 KV-P
//   └─ Tina (TL)
//      ├─ Fritz (FA)  §14.4: FB candidate, 100 P but only 7 KV-P
//      ├─ Paula (FA)  §14.1: every points rule, incl. reversal and correction
//      ├─ Nora (—)    no career level set
//      └─ Igor (FA)   deactivated
//   Frank (FA, finance), Clara (FA, compliance): no reporting line
//   Ida: invited, never accepted
export const CAST: CastMember[] = [
  { email: "dl@test.com", first: "Dora", last: "Direktor", employeeNo: "E2E-DL", level: "DL", manager: null, login: true },
  { email: "tl@test.com", first: "Tim", last: "Teamleiter", employeeNo: "E2E-TL", level: "TL", manager: "dl@test.com", login: true },
  { email: "fb.a@test.com", first: "Anna", last: "Alpha", employeeNo: "E2E-FB-A", level: "FB", manager: "tl@test.com", login: true },
  { email: "fa.a@test.com", first: "Ali", last: "Alpha", employeeNo: "E2E-FA-A", level: "FA", manager: "fb.a@test.com", login: true },
  { email: "fb.b@test.com", first: "Ben", last: "Beta", employeeNo: "E2E-FB-B", level: "FB", manager: "tl@test.com", login: true },
  { email: "tl2@test.com", first: "Tina", last: "Teamleiterin", employeeNo: "E2E-TL2", level: "TL", manager: "dl@test.com", login: true },
  { email: "fa@test.com", first: "Fritz", last: "Fleißig", employeeNo: "E2E-FA", level: "FA", manager: "tl2@test.com", login: true },
  { email: "punkte@test.com", first: "Paula", last: "Punkte", employeeNo: "E2E-PUNKTE", level: "FA", manager: "tl2@test.com", login: true },
  { email: "nolevel@test.com", first: "Nora", last: "Ohnestufe", employeeNo: "E2E-NOLEVEL", level: null, manager: "tl2@test.com", login: true },
  { email: "inactive@test.com", first: "Igor", last: "Inaktiv", employeeNo: "E2E-INAKTIV", level: "FA", manager: "tl2@test.com", login: true, inactive: true },
  { email: "finance@test.com", first: "Frank", last: "Finanz", employeeNo: "E2E-FINANZ", level: "FA", manager: null, roles: ["finance"], login: true, totp: true },
  { email: "compliance@test.com", first: "Clara", last: "Compliance", employeeNo: "E2E-COMPLIANCE", level: "FA", manager: null, roles: ["compliance"], login: true, totp: true },
  { email: "invited@test.com", first: "Ida", last: "Wartend", employeeNo: "E2E-WARTEND", level: null, manager: null, login: false },
];

export const PLANNED_TRANSFER = { employee: "fa.a@test.com", newManager: "fb.b@test.com", from: "2027-06-01" };

export type Category = "LV" | "KV" | "SACH" | "KFZ" | "STROM" | "GAS";
export type FinalStatus = "draft" | "submitted" | "eligible" | "cancelled" | "corrected";

export type ProductionFixture = {
  key: string;
  producer: string;
  category: Category;
  premium: number;
  period: "monthly" | "annual" | "one_off";
  netOrGross?: "net" | "gross";
  termYears?: number;
  reference: string;
  status: FinalStatus;
  correctTo?: number; // corrected premium (same facts otherwise)
  /** Current net totals after the whole lifecycle (as strings, 4 decimals). */
  expected: { points: string; ae: string; kv: string } | null;
};

export const PRODUCTION: ProductionFixture[] = [
  // §14.1 — Paula, one record per rule
  { key: "paula-lv-35", producer: "punkte@test.com", category: "LV", premium: 100, period: "monthly", termYears: 35, reference: "LV 100 € × 35 J. (§14.1)", status: "eligible", expected: { points: "10.5000", ae: "294.0000", kv: "0.0000" } },
  { key: "paula-kv-700", producer: "punkte@test.com", category: "KV", premium: 700, period: "monthly", reference: "KV 700 € (§14.1)", status: "eligible", expected: { points: "25.0000", ae: "700.0000", kv: "25.0000" } },
  { key: "paula-sach-1000", producer: "punkte@test.com", category: "SACH", premium: 1000, period: "annual", netOrGross: "net", reference: "Sach 1.000 € netto (§14.1)", status: "eligible", expected: { points: "5.0000", ae: "140.0000", kv: "0.0000" } },
  { key: "paula-kfz", producer: "punkte@test.com", category: "KFZ", premium: 450, period: "annual", reference: "Kfz ohne Punkte (§3.4)", status: "eligible", expected: { points: "0.0000", ae: "0.0000", kv: "0.0000" } },
  { key: "paula-lv-40", producer: "punkte@test.com", category: "LV", premium: 100, period: "monthly", termYears: 40, reference: "LV 40 J. → max. 35 (OD-06)", status: "eligible", expected: { points: "10.5000", ae: "294.0000", kv: "0.0000" } },
  { key: "paula-kv-333", producer: "punkte@test.com", category: "KV", premium: 333.33, period: "monthly", reference: "KV 333,33 € (Rundung)", status: "eligible", expected: { points: "11.9046", ae: "333.3288", kv: "11.9046" } },
  { key: "paula-kv-cancelled", producer: "punkte@test.com", category: "KV", premium: 280, period: "monthly", reference: "KV storniert", status: "cancelled", expected: { points: "0.0000", ae: "0.0000", kv: "0.0000" } },
  { key: "paula-lv-corrected", producer: "punkte@test.com", category: "LV", premium: 120, period: "monthly", termYears: 35, reference: "LV korrigiert 120 → 100 €", status: "corrected", correctTo: 100, expected: { points: "10.5000", ae: "294.0000", kv: "0.0000" } },
  { key: "paula-strom", producer: "punkte@test.com", category: "STROM", premium: 80, period: "monthly", reference: "Strom eingereicht", status: "submitted", expected: null },
  { key: "paula-gas", producer: "punkte@test.com", category: "GAS", premium: 60, period: "monthly", reference: "Gas Entwurf", status: "draft", expected: null },

  // §14.4 — Fritz, FB candidate: 100 P but only 7 of 10 KV-P
  { key: "fritz-sach-18600", producer: "fa@test.com", category: "SACH", premium: 18600, period: "annual", netOrGross: "net", reference: "Sach 18.600 € netto", status: "eligible", expected: { points: "93.0000", ae: "2604.0000", kv: "0.0000" } },
  { key: "fritz-kv-196", producer: "fa@test.com", category: "KV", premium: 196, period: "monthly", reference: "KV 196 €", status: "eligible", expected: { points: "7.0000", ae: "196.0000", kv: "7.0000" } },

  // §4.5 — Tim (TL → OL): personal 100 P, structure A 800 P (capped to 375), structure B 300 P
  { key: "tim-sach-20000", producer: "tl@test.com", category: "SACH", premium: 20000, period: "annual", netOrGross: "net", reference: "Sach 20.000 € netto", status: "eligible", expected: { points: "100.0000", ae: "2800.0000", kv: "0.0000" } },
  { key: "anna-kv-2240", producer: "fb.a@test.com", category: "KV", premium: 2240, period: "monthly", reference: "KV 2.240 €", status: "eligible", expected: { points: "80.0000", ae: "2240.0000", kv: "80.0000" } },
  { key: "anna-sach-144000", producer: "fb.a@test.com", category: "SACH", premium: 144000, period: "annual", netOrGross: "net", reference: "Sach 144.000 € netto", status: "eligible", expected: { points: "720.0000", ae: "20160.0000", kv: "0.0000" } },
  { key: "ben-kv-1120", producer: "fb.b@test.com", category: "KV", premium: 1120, period: "monthly", reference: "KV 1.120 €", status: "eligible", expected: { points: "40.0000", ae: "1120.0000", kv: "40.0000" } },
  { key: "ben-sach-52000", producer: "fb.b@test.com", category: "SACH", premium: 52000, period: "annual", netOrGross: "net", reference: "Sach 52.000 € netto", status: "eligible", expected: { points: "260.0000", ae: "7280.0000", kv: "0.0000" } },
];

/**
 * Career state right after filling (counting window = the current career
 * period, which contains today). Thresholds from spec §2: FB 100, TL 300,
 * OL 750, DL 1500, RL 4000; KV minimum 10 % of the threshold; from OL on one
 * structure counts at most 50 % of the threshold.
 */
export const EXPECTED_CAREER: Record<string, { target: Level; points: string; kv: string; ready: boolean; note: string }> = {
  "punkte@test.com": { target: "FB", points: "73.4046", kv: "36.9046", ready: false, note: "26,5954 P fehlen" },
  "fa@test.com": { target: "FB", points: "100.0000", kv: "7.0000", ready: false, note: "§14.4: Punkte erreicht, 3 KV-P fehlen" },
  "fb.a@test.com": { target: "TL", points: "800.0000", kv: "80.0000", ready: true, note: "weit über 300 P" },
  "fb.b@test.com": { target: "TL", points: "300.0000", kv: "40.0000", ready: true, note: "genau an der Schwelle 300 P" },
  "tl@test.com": { target: "OL", points: "775.0000", kv: "77.5000", ready: true, note: "§4.5: 100 + 375 (A begrenzt) + 300; KV 37,5 + 40" },
};

/** CSV for the import page: 2 valid rows and one row per error kind. Pers.-Nr. E2E-PUNKTE = Paula. */
export function importCsv(businessDate: string): string {
  const [y, m, d] = businessDate.split("-");
  const de = `${d}.${m}.${y}`;
  return [
    "Quelle-ID;Pers.-Nr.;Sparte;Beitrag;Rhythmus;Netto/Brutto;Laufzeit;Datum;Referenz",
    `IMP-001;E2E-PUNKTE;LV;100,00;monatlich;;35;${de};Import LV gültig`,
    `IMP-002;E2E-PUNKTE;SACH;2.000,00;jährlich;netto;;${de};Import Sach gültig`,
    `IMP-002;E2E-PUNKTE;SACH;2.000,00;jährlich;netto;;${de};doppelte Quelle-ID`,
    `IMP-003;E2E-UNBEKANNT;KV;100,00;monatlich;;;${de};unbekannte Pers.-Nr.`,
    `IMP-004;E2E-PUNKTE;SACH;1.000,00;jährlich;brutto;;${de};Sach brutto`,
    `IMP-005;E2E-PUNKTE;KV;abc;monatlich;;;${de};keine Zahl`,
    `;E2E-PUNKTE;KV;100,00;monatlich;;;${de};fehlende Quelle-ID`,
  ].join("\n");
}
