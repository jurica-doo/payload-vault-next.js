/**
 * rpc_rules_at() payload for the seeded spec values (migration
 * 20261026170000_rules_config.sql). Shared by domain tests so the TS engine is
 * tested against exactly what the database returns.
 */
export const SEEDED_RULES_PAYLOAD = {
  date: "2026-06-01",
  levels: {
    version_id: "v-levels",
    label: "Karrierestufen laut Spezifikation v1.0",
    effective_from: "2026-01-01",
    reserve_ratio: 0.1,
    rows: [
      { code: "FA", rank: 1, name_de: "Finanzassistent", point_rate: 28.0, max_subsidy: null, threshold_points: 0.0, kv_min_ratio: 0.1, structure_cap_ratio: null },
      { code: "FB", rank: 2, name_de: "Fachberater", point_rate: 56.0, max_subsidy: 500.0, threshold_points: 100.0, kv_min_ratio: 0.1, structure_cap_ratio: null },
      { code: "TL", rank: 3, name_de: "Teamleiter", point_rate: 70.0, max_subsidy: 1000.0, threshold_points: 300.0, kv_min_ratio: 0.1, structure_cap_ratio: null },
      { code: "OL", rank: 4, name_de: "Organisationsleiter", point_rate: 92.0, max_subsidy: 1500.0, threshold_points: 750.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5 },
      { code: "DL", rank: 5, name_de: "Direktionsleiter", point_rate: 112.0, max_subsidy: 2500.0, threshold_points: 1500.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5 },
      { code: "RL", rank: 6, name_de: "Regionalleiter", point_rate: 132.0, max_subsidy: 3500.0, threshold_points: 4000.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5 },
      { code: "VD", rank: 7, name_de: "Vertriebsdirektor", point_rate: 144.0, max_subsidy: 6000.0, threshold_points: 9000.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5 },
    ],
  },
  conversion: {
    version_id: "v-conv",
    label: "Punkteumrechnung laut Spezifikation v1.0",
    effective_from: "2026-01-01",
    ae_per_point: 28.0,
    rows: [
      { category_code: "LV", name_de: "Lebensversicherung", is_kv: false, formula_kind: "lv_monthly_term", divisor: 4000.0, max_term_years: 35, required_premium_period: "monthly", required_net_gross: null },
      { category_code: "KV", name_de: "Krankenversicherung", is_kv: true, formula_kind: "kv_monthly", divisor: 28.0, max_term_years: null, required_premium_period: "monthly", required_net_gross: null },
      { category_code: "SACH", name_de: "Sachversicherung", is_kv: false, formula_kind: "sach_annual_net", divisor: 200.0, max_term_years: null, required_premium_period: "annual", required_net_gross: "net" },
      { category_code: "KFZ", name_de: "Kfz-Versicherung", is_kv: false, formula_kind: "none", divisor: null, max_term_years: null, required_premium_period: null, required_net_gross: null },
      { category_code: "STROM", name_de: "Strom", is_kv: false, formula_kind: "none", divisor: null, max_term_years: null, required_premium_period: null, required_net_gross: null },
      { category_code: "GAS", name_de: "Gas", is_kv: false, formula_kind: "none", divisor: null, max_term_years: null, required_premium_period: null, required_net_gross: null },
    ],
  },
};


/**
 * rpc_rules_at() payload for "Stand 01.11.2026" (migration
 * 20261101140000_rules_profina_2026_11.sql): Profina Karriereplan (Anlage 2),
 * AE-first conversion with the Absatzteiler, VD+ and GM appointed only.
 */
export const RULES_2026_11_PAYLOAD = {
  date: "2026-11-15",
  levels: {
    version_id: "v-levels-2026-11",
    label: "Karriereplan (Anlage 2), Stand 01.11.2026",
    effective_from: "2026-11-01",
    reserve_ratio: 0.1,
    rows: [
      { code: "FA", rank: 1, name_de: "Finanzassistent", point_rate: 28.0, max_subsidy: null, threshold_points: 0.0, kv_min_ratio: 0.1, structure_cap_ratio: null, appointed_only: false },
      { code: "FB", rank: 2, name_de: "Fachberater", point_rate: 56.0, max_subsidy: 500.0, threshold_points: 100.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5, appointed_only: false },
      { code: "TL", rank: 3, name_de: "Teamleiter", point_rate: 70.0, max_subsidy: 1000.0, threshold_points: 300.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5, appointed_only: false },
      { code: "OL", rank: 4, name_de: "Organisationsleiter", point_rate: 92.0, max_subsidy: 1500.0, threshold_points: 750.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5, appointed_only: false },
      { code: "DL", rank: 5, name_de: "Direktionsleiter", point_rate: 112.0, max_subsidy: 2500.0, threshold_points: 1500.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5, appointed_only: false },
      { code: "RL", rank: 6, name_de: "Regionalleiter", point_rate: 132.0, max_subsidy: 3500.0, threshold_points: 4000.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5, appointed_only: false },
      { code: "VD", rank: 7, name_de: "Vertriebsdirektor", point_rate: 144.0, max_subsidy: 6000.0, threshold_points: 9000.0, kv_min_ratio: 0.1, structure_cap_ratio: 0.5, appointed_only: false },
      { code: "VDP", rank: 8, name_de: "Vertriebsdirektor+", point_rate: 144.0, max_subsidy: null, threshold_points: 9000.0, kv_min_ratio: 0.1, structure_cap_ratio: null, appointed_only: true },
      { code: "GM", rank: 9, name_de: "Generalmanager", point_rate: 144.0, max_subsidy: null, threshold_points: 9000.0, kv_min_ratio: 0.1, structure_cap_ratio: null, appointed_only: true },
    ],
  },
  conversion: {
    version_id: "v-conv-2026-11",
    label: "Absatzeinheiten (Anlage 2 §4), Stand 01.11.2026",
    effective_from: "2026-11-01",
    ae_per_point: 28.0,
    divisor_unit: "ae",
    rows: [
      { category_code: "LV", name_de: "Lebensversicherung", is_kv: false, formula_kind: "lv_monthly_term", divisor: 142.86, max_term_years: null, required_premium_period: "monthly", required_net_gross: null, pays_commission: true, counts_for_career: true },
      { category_code: "KV", name_de: "Krankenversicherung", is_kv: true, formula_kind: "kv_monthly", divisor: 1.0, max_term_years: null, required_premium_period: "monthly", required_net_gross: null, pays_commission: true, counts_for_career: true },
      { category_code: "SACH", name_de: "Sachversicherung", is_kv: false, formula_kind: "sach_annual_net", divisor: 7.15, max_term_years: null, required_premium_period: "annual", required_net_gross: "net", pays_commission: true, counts_for_career: true },
      { category_code: "RS", name_de: "Rechtsschutzversicherung", is_kv: false, formula_kind: "sach_annual_net", divisor: 7.15, max_term_years: null, required_premium_period: "annual", required_net_gross: "net", pays_commission: true, counts_for_career: true },
      { category_code: "KFZ", name_de: "Kfz-Versicherung", is_kv: false, formula_kind: "sach_annual_net", divisor: 35.71, max_term_years: null, required_premium_period: "annual", required_net_gross: "net", pays_commission: false, counts_for_career: false },
      { category_code: "STROM", name_de: "Strom", is_kv: false, formula_kind: "none", divisor: null, max_term_years: null, required_premium_period: null, required_net_gross: null, pays_commission: true, counts_for_career: true },
      { category_code: "GAS", name_de: "Gas", is_kv: false, formula_kind: "none", divisor: null, max_term_years: null, required_premium_period: null, required_net_gross: null, pays_commission: true, counts_for_career: true },
    ],
  },
};
