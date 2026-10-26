# r1/p0/ui-kit — Shared UI components

| | |
|---|---|
| Branch | `r1/p0/ui-kit` → merged into `r1/p0-groundwork` |
| Plan section | IMPLEMENTATION_PLAN.md §5.1, §6 Phase 0 · `r1/p0/ui-kit` |
| Status | Done; 113 unit tests green; checked in the browser (dark + light) |
| Date | 2026-10-26 |

## What was done

Data-free building blocks for every sales-system screen. None of them talks to Supabase; data hooks arrive with the Phase 1 slices.
They follow the existing conventions: design-token classes (`color-*`, `rounded-radius-*`, `shadow-shadow-*`), German copy, light/dark via `data-theme`.

| Component / module | Path | Purpose |
|---|---|---|
| Formatting | `src/utils/format.ts` | `formatMoney`, `formatPoints`, `formatAe`, `formatPercent`, `safeRatio`, `formatDate`, `formatDateTime`, `toDecimal`. Values go Decimal → exact string → `Intl`, never through a JS float. |
| `MoneyValue` / `PointsValue` / `AeValue` | `components/values/Values.tsx` | Number + unit. Money kinds: `brutto`, `Reserve`, `nach Reserve`, `Zuschuss`; there is deliberately **no "netto"/take-home label** (§6.3). KV points are labelled `KV-P` (§3.2). Negatives are red. |
| `StatusBadge` | `components/statusBadge/` | One badge for every status column; each module passes its own label/tone map. Unknown statuses still render. |
| `KpiTile` | `components/kpiTile/` | Value + change vs a named comparison; `goodWhen: "down"` for "bad" metrics; "Schätzung" badge for forecasts (§7.5). |
| `ProgressMeter` | `components/progressMeter/` | Achieved / required, remaining, cap markers (50 % structure cap), pace line ("Im Plan" / "Hinter Plan") (§7.4). |
| `CalculationBreakdown` | `components/calculationBreakdown/` | "Woher kommt diese Zahl?": inputs → formula → steps → result → rule version → source links (§1, §14.1). Rendered as modal content. |
| `ProvisionalRuleNotice` | `components/provisionalRuleNotice/` | "Vorläufige Regel (OD-xx)" banner for every number that depends on an open decision. |
| `DataTable` | `components/dataTable/` | Typed columns, sorting (local or server-controlled, `aria-sort`), pagination, loading skeleton, inline error, empty state, keyboard row activation, card layout on mobile. |
| `TextArea`, `DateInput`, `DecimalInput`, `CurrencyInput`, `parseGermanDecimal` | `components/formFields/` | The field types `InputField` lacks, with the same styling. German number entry (`1.234,56`) is parsed into an API string (`1234.56`), or `null` if invalid. |
| `ReasonConfirmForm` | `components/reasonConfirm/` | Confirmation that needs a written reason (≥ 10 characters, trimmed, max 500) for reassignments, transfers and overrides. Keeps the dialog open and shows the server error on failure. |
| `AuditTimeline` | `components/auditTimeline/` | Actor (or "System"), Berlin time, reason, old → new per field (§12.3). |
| `StageStepper` | `components/stageStepper/` | Lead pipeline position; a terminal outcome ("Verloren") replaces the rest of the path. |
| `HierarchyTree` | `components/hierarchyTree/` | WAI-ARIA tree (arrows, Home/End, Enter). The caller loads children lazily. Cycle-safe. |
| `FunnelChart` | `components/charts/` | Conversion steps with "x % von N" and a required time-window caption (§8.2). |
| `TrendChart` | `components/charts/` | Recharts line with a required caption; missing months are gaps, not zeros. |
| `PeriodSelector`, `periodToRange` | `components/periodSelector/` | Month / year / career period / custom range → half-open `[start, end)` query range. |
| `RoleGate` | `components/roleGate/` | Hides UI the user can't use. Presentation only; the database stays the security boundary. |
| Showcase | `app/dev/ui/page.tsx`, `src/views/devUi/DevUiPage.tsx` | Every component with realistic spec examples. **Development only**: verified to return 404 under `next start`. |

Not built as a separate component: the plan's `FormSelect` and `EmployeePicker` base. The existing `Dropdown` already supports search, so `EmployeePicker` will wrap it in `r1/p1/hierarchy`.

### Also in this branch
- `.github/workflows/ci.yml`: `actions/checkout` and `actions/setup-node` bumped v4 → v5, because GitHub flagged v4 as Node 20 (deprecated) on the first CI run.
- **CI on GitHub passed** for `r1/p0-groundwork` (run 40298584667: app job 1 m 3 s, db job 28 s).

## How to verify
```bash
npm test               # 113 tests in 10 files
npm run typecheck
npm run lint           # 0 errors
npm run dev            # then open http://localhost:5173/dev/ui
```
On `/dev/ui`, check:
- dark and light theme (toggle in the profile menu, or `document.documentElement.dataset.theme = "light"`)
- the "Berechnung anzeigen" modal
- table sorting
- tree keyboard navigation (Tab into the tree, then the arrow keys)
- the "Lead neu zuweisen…" dialog with a short reason (it must refuse)
- the currency field with `1.234,56`, `abc` and `12,`

## What to look out for
- **The service worker caches JS in development.** While checking this branch the browser kept showing old code even after restarting the dev server. `useRegisterSW` registers `/sw.js` in development too, and the worker serves cached chunks. Workaround: DevTools → Application → Service workers → Unregister, plus Clear storage. This gets fixed in `r1/p0/app-shell` (don't register in development, and unregister an existing one).
- **Global typography.** `src/index.css` gives `h1`–`h4` and `p` large responsive sizes in the base layer. Inside components, always put a size class **on the element itself** (`<h4 className="text-sm">`). A size on a parent doesn't win against the element rule. `CalculationBreakdown` hit this.
- **macOS `sed -i` and hot reload.** Editing with `sed -i` replaces the file, and Turbopack sometimes misses it. Touch the file or restart `npm run dev` if a change doesn't show.
- **Hydration warning on `/dev/ui`.** It comes from a Chrome extension that injects a script into `<head>`. It reproduces on every page and isn't caused by this branch.
- **Mobile layout wasn't visually checked.** The browser window couldn't be resized from the tooling. Mobile behaviour is covered by markup/tests (`md:hidden` card list, `hideOnMobile`), but check `/dev/ui` at 360 px in DevTools device mode.
- The existing `Modal` doesn't close on Escape. That's pre-existing behaviour, not changed here.
- `TrendChart` uses Recharts `initialDimension` to avoid the "width(-1)" server-render warning.

## Edge cases covered by tests
- **Formatting**: half-up rounding (`0,125 → 0,13`); negative zero never shown; values beyond float precision; `null`/`NaN`/`Infinity`/empty → "–"; dates without time-zone shift; Berlin time across DST (12:00 summer vs 11:00 winter for 10:00 UTC).
- **Values**: `-0,001` is shown as `0,00` and **not** red (this was a bug, found and fixed while writing the tests); KV unit label; missing AE.
- **ProgressMeter**: the §14.4 example (7 of 10 KV → 70 %, "Noch 3,00"); over-achievement capped at 100 % with the real value shown; zero requirement (no division by zero); negative totals clamp at 0; cap marker and pace.
- **KpiTile**: `goodWhen: "down"` colours; missing comparison says "Kein Vergleich" instead of "NaN %".
- **DataTable**: German collation with umlauts (Abel, Bauer, Özil, Zander); stable ties; nulls last in both directions; controlled sorting doesn't reorder locally; loading, error and empty states; pagination bounds; Enter activates a row.
- **parseGermanDecimal**: `10,5`, `1.234,56`, `1.234`, `1.000.000`, `0.5`, negatives and spaces are accepted; `1,2,3`, `1e5`, `12,`, `,5` and `--1` are rejected.
- **ReasonConfirmForm**: whitespace-padded short reason rejected; reason trimmed; server error shown while the dialog stays open.
- **HierarchyTree**: aria levels and expanded state; ArrowRight/ArrowLeft; lazy-load hint; Enter selects; empty tree; **a cycle in the data doesn't hang the page**.
- **FunnelChart**: the §8.2 example (20 held → 8 sales = 40 % von 20); 0 → "–".
- **periodToRange**: December rollover, February in a leap year, an inclusive custom range made half-open across 29 Feb, an inverted range, an unknown career period.
