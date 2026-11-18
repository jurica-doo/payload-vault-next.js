# Open decisions: answers from Profina's contract documents (Stand 01.11.2026)

Source: Profina **Tippgebervertrag** (template) with **Anlage 1 „Provisionssätze“** and **Anlage 2 „Karriereplan“**, all
"Stand 01.11.2026". Both Anlagen state that they belong to the Handelsvertretervertrag **and** the Tippgebervertrag, so
they are treated as company-wide rules. Clauses that appear only in the Tippgeber contract body (Ziff. 4, 5, 8–10:
cancellation liability, reserve, own contracts, statements, debit balance) are treated as the company standard as well,
**to be confirmed for the Handelsvertretervertrag** (question Q3).

References: **A1** = Anlage 1, **A2** = Anlage 2, **Ziff.** = clause of the contract body. Recorded 2026-11-18.

Legend: ✅ answered · ◐ partly answered · ⏳ not covered by the documents.

## 1. Verdicts

| OD | Status | What the documents say | Built model | Action |
|---|---|---|---|---|
| OD-01 Period boundaries | ✅ differs | A2 §1: the threshold must be reached within the **last twelve full calendar months, rolling**. | First personal year, transition, calendar years | Engine phase **E1** |
| OD-02 Transition / carry-over | ✅ | Follows from the rolling window: no transition period, no carry-over. New: a promotion must be **confirmed once** in the 12 full calendar months after the promotion month with ≥ 80 % of that level's threshold (counted as A2 §2 but **without** the 50 % clause); otherwise Profina *may* demote. Does not apply to VD+ and GM. | Separate transition period; no confirmation | **E1** |
| OD-03 KV in total / KV vs. cap | ✅ differs | A2 §3d: KV AE count in the total. At least 10 % of the target threshold must come from KV. From the **strongest structure** at most **half of the required KV share** counts; own KV counts in full (VD example: ≥ 900 P KV, ≤ 450 P of it from the strongest structure). | KV share of a capped structure kept proportionally | **E2** |
| OD-04 Structure / cap level | ✅ differs | A2 §2: a structure = a directly subordinate partner with everyone below. The 50 % clause applies to **every** target level, and to the **strongest** structure ("aus der umsatzstärksten Struktur"). New: **minimum own business** FB 30 P, TL 60 P (A2 §1, "davon Eigenumsatz"). | Cap only from OL; every structure capped; no own-business minimum | Cap on FB/TL: **done** (rules version 2026-11); strongest-only + own minimum: **E2** |
| OD-05 Differential matrix | ◐ | A1 Nr. 3: with several agents on one contract, each gets **own rate − rate of the next lower participating agent**. Rates are **per line (Sparte) and kind**, as a percentage/per mille of a basis, not € per point. Only FA and FB are listed. | Rate compression on € per point | **E3**; TL…GM rates stay provisional (Q1) |
| OD-06 LV term > 35 years | ✅ | A1/A2 §4: the LV basis is the **agreed Beitragssumme**; no cap. | min(term, 35) | **Done** (no cap from 2026-11-01) |
| OD-07 Precision | ✅ | A2 §4: AE = basis ÷ Absatzteiler, rounded half-up to **2 decimals**; 1 Europunkt = 28 AE. | Points first (4 dp), AE = points × 28, AE shown as an integer | **Done** (AE-first from 2026-11-01, AE shown with 2 dp) |
| OD-08 Eligibility | ✅ | A2 §2/§3b: only business **settled net by the product company** (abgerechnet) counts; reversals are deducted; submitted applications don't count. Commission is due when the contract is in force, the policy is issued, the first premium is paid and Profina has received its commission (Ziff. 8). | Manual status `eligible` | **Done**: same mechanism, the status is labelled „Abgerechnet“, notice removed |
| OD-09 Subsidy | ✅ | A2 §5: from FB, separate fixed-term agreement, both sides may terminate, no claim to it or to renewal, Profina decides. **Paid subsidies are not reclaimed.** Each agreement has a monthly sales expectation in net-settled AE (own + structure): at the maximum FB 333, TL 667, OL 1.000, DL 1.667, RL 2.333, VD 4.000 AE; a lower amount lowers it proportionally; subordinates' own subsidy expectations are added. | Manual approved amount | **E4** |
| OD-10 Reserve | ✅ | Ziff. 5: reserve **≥ 10 % of pre-financed commission** (Profina may set more), no interest. Partial release when the cancellation-liability volume of all contracts is below the reserve balance; full release when no contract is in its liability period. Profina uses the reserve only when due clawbacks aren't paid within the set deadline. Ziff. 4: liability period **5 years** unless a product says otherwise; commission is reclaimed in full or in part on cancellation, reduction, premium holiday or non-payment, and always when Profina has to repay ("Schicksalsteilung"). | 10 % of every amount; release/clawback manual | **E3** |
| OD-11 Email provider | ⏳ | — | — | open |
| OD-12 Rule version / date | ✅ differs | A1 Nr. 1: the agent's level **at the time the contract is processed** counts. Ziff. 6: after a promotion or demotion the new rates apply **from the following month**. Ziff. 7: rate changes are announced 8 weeks ahead. | Production date | **E3** (Q4: what "Verarbeitung" means) |
| OD-13 Customer visibility | ⏳ | — (Ziff. 12 only covers confidentiality) | — | open |
| OD-14 Contract portal | ⏳ | Statements are delivered in the „VO-Portal“ (Ziff. 9, 14); no integration details. | — | open |
| OD-15 Promotion automatic/approved | ◐ | Initial placement with the management; VD+ and GM are **appointed** by the management, not reached by threshold; demotion after a failed confirmation is at Profina's discretion; a non-cash prize on first reaching VD. Automatic vs. approved promotion isn't stated. | Approved from the "ready" queue | Keep approval; VD+/GM levels **done** (appointed only); Q11 |
| OD-16 Retention | ⏳ | — | — | open |
| OD-17 Leaders see team commission | ⏳ | — (remuneration counts as a business secret, Ziff. 12) | Off | open |
| OD-18 Strom/Gas/Kfz | ◐ | Kfz: AE = net annual premium ÷ 35.71; commission only **recurring** 1.5 % (FA) / 2.5 % (FB) p.a. New line **Rechtsschutz** (AE ÷ 7.15). Pets and bicycles: separate rates. Strom/Gas: not mentioned. | 0 P / 0 AE for Kfz, Strom, Gas | Kfz/RS AE **done** (no commission per point); rest Q10 |
| OD-19 Lead SLA | ⏳ | — | — | open |

The design choices in CHECKLIST §2 (lead SLA from receipt, analytics by current owner, …) are not covered by the documents.

## 2. Rule tables from the documents

**Absatzeinheiten (A2 §4).** Only new business, replacement business net of the old contract, extra premium from
changes and reinstatement create AE. Portfolio, recurring and follow-up commission create none; automatic changes
(tariff restructuring, age steps) don't count. AE have a **12-month liability** from the contract start and are reversed on
cancellation.

| Line | Basis | Absatzteiler | Points (= AE ÷ 28) |
|---|---|---|---|
| Leben und Dynamik | Beitragssumme | 142.86 | ≈ basis ÷ 4000 (unchanged) |
| Sach, Haftpflicht, Unfall | net annual premium | 7.15 | ≈ basis ÷ 200.2 (was ÷ 200) |
| KV new/changed business | monthly premium | 1.00 | basis ÷ 28 (unchanged) |
| Rechtsschutz | net annual premium | 7.15 | new |
| Kraftfahrt | net annual premium | 35.71 | new (was 0) |

**Levels (A2 §1).** Thresholds FB 100, TL 300, OL 750, DL 1.500, RL 4.000, VD 9.000 Europunkte (unchanged); own business
FB 30 / TL 60; VD+ and GM by appointment; maximum subsidy unchanged (FB 500 € … VD 6.000 €).

**Commission rates (A1)**, valid for all connected companies of a line; FA / FB only:

| Line and kind | Basis | FA | FB |
|---|---|---|---|
| Leben, BU, Rente — Abschluss | ‰ of Beitragssumme | 7.00 | 14.00 |
| Sach, Haftpflicht, Unfall — Abschluss | % net annual premium | 10 | 13 |
| Sach, Haftpflicht, Unfall — Bestand p. a. | % net annual premium | 1 | 1.5 |
| Kraftfahrt — laufend p. a. | % net annual premium | 1.50 | 2.50 |
| Kranken new/changed — Abschluss | % monthly premium | 100 | 200 |
| Bestandsbetreuung Kranken und Leben — laufend | % monthly premium | 0.0 | 0.2 |
| Rechtsschutz 5 years — Abschluss | % net annual premium | 0 | 15 |
| Rechtsschutz < 5 years — Abschluss | % net annual premium | 0 | 4 |
| Rechtsschutz — Folgeprovision from year 2 | % net annual premium | 0 | 4 |

Cross-check with the built model: for LV and KV the built € per point rates give exactly the same amounts for FA and FB
(28 €/P = 7 ‰ = 100 %; 56 €/P = 14 ‰ = 200 %). **Sach does not match** (built: 28 €/P × JB ÷ 200 = 14 % instead of 10 %),
and the recurring kinds don't exist yet.

**Statements (Ziff. 9, 10).** Monthly when there's a booking; amounts are **gross, including VAT where it applies**;
delivered in the VO-Portal; current account under § 355 HGB; deemed accepted if not objected to within **8 weeks**;
a debit balance must be paid within **10 days**. **Own contracts** (the agent is policyholder or insured person) earn no
commission (Ziff. 4).

## 3. What was changed now

Rules version **„Stand 01.11.2026“** (migration `20261101140000_rules_profina_2026_11.sql`, effective 2026-11-01; the
2026-01-01 versions remain for older production):
- conversion computed AE-first with the Absatzteiler above; AE rounded to 2 dp, points = AE ÷ 28 (4 dp)
- no LV term cap
- new line Rechtsschutz; Kfz and Rechtsschutz create AE/points but **no commission per point**
  (`conversion_rules.pays_commission = false`) until the commission engine knows recurring kinds (E3)
- 50 % structure cap from FB on
- levels VD+ (`VDP`) and GM (`appointed_only`; no automatic target, rate = VD's, provisional)
- the eligible status reads „Abgerechnet“; the notices for OD-06/07/08 are gone

## 4. Engine phases still to build

| Phase | Content |
|---|---|
| **E1 Periods** | Rolling window of the last 12 full calendar months, starting no earlier than the month after the last promotion (agreed provisional reading, Q2). Confirmation year check (80 %, no cap) feeding a demotion review queue. |
| **E2 Qualification** | 50 % clause on the strongest structure only (Q7); KV: at most half the KV requirement from the strongest structure, own KV in full; own-business minimum (`own_min_points`); retention rate ≥ 90 % over the 12 months before promotion (needs AE reversal tracking); 12-month AE liability. |
| **E3 Commission** | Rate table level × line × kind (Abschluss / Bestand / laufend / Folge) on the A1 basis; differential per line; level at processing, level changes from the following month; own contracts excluded; reserve only on pre-financed commission, plus release and clawback per Ziff. 5; 5-year liability per product; 8-week objection and 10-day debit balance on statements. |
| **E4 Subsidy** | Sales expectation per agreement (incl. subordinates' expectations), monthly actual vs. expectation, end date required, no reclaim. |

## 5. Questions for Profina

1. **Anlage 1 for all levels** TL, OL, DL, RL, VD, VD+, GM (every line and kind). Without it the differential above FB stays provisional.
2. Does business from **before a promotion** count toward the next level, or does the 12-month window start after the promotion month? (Built: it restarts.)
3. Do the Handelsvertretervertrag terms match the Tippgeber body on cancellation liability (5 years), reserve, own contracts, statements and debit balance?
4. What exactly is the **„Verarbeitung“** date in A1 Nr. 1 (submission, policy issue, settlement by the product company)?
5. Do **own contracts** create AE for the career, even though they earn no commission?
6. How is a partial clawback calculated: always the product company's clawback passed through, or pro rata over the liability period?
7. 50 % clause: is only the **strongest** structure capped, or every structure? (Wording says strongest.)
8. Rates and subsidies for **VD+ and GM**.
9. LV: is the Beitragssumme **including Dynamik**, and should advisers enter it directly instead of monthly premium × term?
10. Rates for **pets and bicycles**; does **Strom/Gas** count at all?
11. Promotion: automatic once all conditions are met, or decided by the management?
12. Still open from the register: OD-11, OD-13, OD-14, OD-16, OD-17, OD-19 and the design choices in CHECKLIST §2.
