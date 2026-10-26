import Link from "next/link";
import type { ReactNode } from "react";

export type BreakdownStep = { label: string; value: ReactNode; note?: string };

export type BreakdownSource = { label: string; href: string };

/**
 * "Woher kommt diese Zahl?" — the drill-down every calculated number needs
 * (§1 "Explainable", §14.1 "displays the inputs, formula and rule version").
 * Render it as modal content:
 *
 *   openModal({ title: "Berechnung", size: "large",
 *               children: <CalculationBreakdown … /> })
 */
export const CalculationBreakdown = ({
  inputs,
  formula,
  steps = [],
  result,
  ruleVersion,
  sources = [],
  provisionalNotice,
}: {
  inputs: BreakdownStep[];
  formula?: string;
  steps?: BreakdownStep[];
  result: { label: string; value: ReactNode };
  ruleVersion?: string;
  sources?: BreakdownSource[];
  provisionalNotice?: ReactNode;
}) => (
  <div className="flex flex-col gap-5 pt-2 text-sm">
    {provisionalNotice}

    <section>
      <h4 className="mb-2 text-sm font-semibold text-color-text-main">Eingaben</h4>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        {inputs.map((row) => (
          <Row key={row.label} {...row} />
        ))}
      </dl>
    </section>

    {formula && (
      <section>
        <h4 className="mb-2 text-sm font-semibold text-color-text-main">Formel</h4>
        <code className="block break-words rounded-radius-md bg-color-bg-dark px-3 py-2 text-color-text-secondary">
          {formula}
        </code>
      </section>
    )}

    {steps.length > 0 && (
      <section>
        <h4 className="mb-2 text-sm font-semibold text-color-text-main">Rechenweg</h4>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
          {steps.map((row) => (
            <Row key={row.label} {...row} />
          ))}
        </dl>
      </section>
    )}

    <div className="flex items-baseline justify-between gap-4 border-t border-color-border-light pt-3 text-base">
      <span className="font-semibold text-color-text-main">{result.label}</span>
      <span className="font-bold text-color-primary">{result.value}</span>
    </div>

    {(ruleVersion || sources.length > 0) && (
      <footer className="flex flex-col gap-1 text-xs text-color-text-subtle">
        {ruleVersion && <p className="text-xs">Regelversion: {ruleVersion}</p>}
        {sources.length > 0 && (
          <ul className="flex flex-wrap gap-x-3">
            {sources.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="underline hover:text-color-primary">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </footer>
    )}
  </div>
);

const Row = ({ label, value, note }: BreakdownStep) => (
  <>
    <dt className="text-color-text-secondary">
      {label}
      {note && <span className="block text-xs text-color-text-subtle">{note}</span>}
    </dt>
    <dd className="text-right tabular-nums text-color-text-main">{value}</dd>
  </>
);
