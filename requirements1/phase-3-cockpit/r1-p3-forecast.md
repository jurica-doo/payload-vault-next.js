# r1/p3/forecast — Pace-based forecasts

| | |
|---|---|
| Branch | `r1/p3/forecast` → merged into `r1/p3-cockpit` |
| Plan section | IMPLEMENTATION_PLAN.md §6 Phase 3 · `r1/p3/forecast`; spec §7.4 ("whether the current pace is sufficient"), §7.5 |
| Status | Done; 1 new pgTAP assertion (479 total), 14 new unit tests (307 total) |
| Date | 2026-10-27 |

## What was done
| Object | Notes |
|---|---|
| `src/domain/forecast.ts` | `projectMonthEnd(actual, monthStart, asOf)`: month-end value at this month's pace (today counts as elapsed, so no division by zero; negatives floor at 0). `historicalAverage(trend)`: average of the last complete months, excluding the running one. `projectCareer(eligible, required, windowStart, periodEnd, asOf)`: linear projection to the (exclusive) period end, with on-track yes/no, **points per day still needed**, and days remaining. Every result carries its **method as German text**. |
| Migration `20261027130000_dashboard_forecast.sql` | `rpc_dashboard_me` also returns `career.window_start` (the window can start after the period start after a promotion). Same function otherwise. |
| `/vertrieb` | A **"Prognose Monatsende"** tile marked "Schätzung", with method and 3-month average for comparison, plus change vs. goal. Below the career meters: "Bei gleichem Tempo ca. X P zum Periodenende – das reicht / nötig wären Y P pro Tag / im laufenden Zeitraum nicht mehr erreichbar", marked "Schätzung" with its method. |

Forecasts are **display only** (§7.5): nothing is stored or used in career or commission results.

## How to verify
```bash
npx vitest run src/domain/forecast.test.ts src/views/dashboard
npm run test:db -- 130
```

## What to look out for
- The pace is **linear in calendar days**. Weekends, holidays and seasonality are ignored, and early in a month the projection swings a lot. The method text says so; refine with working days once the Phase 4 business calendar exists.
- Open opportunities and planned appointments (§7.5) can feed the forecast once Phase 4 tracks them.

## Edge cases covered by tests
- month: 10 P after 10/31 days → 31; first day counts (2 → 62); February in a leap year; outside the month or bad input → null; negative actuals floor at 0; method text
- average: excludes the running month; fewer months; none → null
- career: 50 P after 73/365 days → 250, on track, 292 days left; 10 of 100 with 30 days left → 3 P/day needed; requirement met → 0; last day and short → null ("nicht mehr erreichbar"); a 61-day transition period
- DB: dashboard returns the window start
- UI: "Prognose Monatsende" with "Hochrechnung: bisheriges Tempo (26 von 31 Tagen)" and the career method line
