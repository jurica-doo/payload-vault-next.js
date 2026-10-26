"use client";

import { useState } from "react";
import { DecimalInput } from "../../components/formFields/FormFields";
import { ProgressMeter } from "../../components/progressMeter/ProgressMeter";
import { PointsValue } from "../../components/values/Values";
import { careerGap, simulateCareer, type ProgressBase } from "../../domain/careerSimulator";
import { formatPoints, parseGermanDecimal } from "../../utils/format";

const num = (s: string) => parseGermanDecimal(s) ?? "0";

/**
 * "Was wäre, wenn …" for the career check (§7.4, Phase 3 simulator). Uses
 * the same rule function as the database, so caps and KV shares behave
 * exactly like the real calculation. Nothing is saved.
 */
export const CareerSimulator = ({ base, target }: { base: ProgressBase; target: string }) => {
  const [personal, setPersonal] = useState("");
  const [personalKv, setPersonalKv] = useState("");
  const [structures, setStructures] = useState<Record<string, string>>({});

  const gap = careerGap(base);
  const sim = simulateCareer(base, {
    personalPoints: num(personal),
    personalKv: num(personalKv),
    structures: Object.fromEntries(Object.entries(structures).map(([id, v]) => [id, { points: num(v) }])),
  });

  return (
    <section className="flex flex-col gap-4 rounded-radius-lg bg-color-bg-card p-4 shadow-shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Simulation</h3>
        <span className="rounded-full border border-color-secondary/40 px-2 text-xs text-color-secondary">Schätzung – wird nicht gespeichert</span>
      </header>

      <div className="text-sm">
        <p>
          Bis {target} fehlen <PointsValue value={gap.pointsMissing} /> und <PointsValue value={gap.kvMissing} isKv />.
          Eigene Produktion zählt immer vollständig.
        </p>
        {gap.headroom.some((h) => h.remaining !== null) && (
          <ul className="mt-1 text-xs text-color-text-secondary">
            {gap.headroom.map((h) => (
              <li key={h.id}>
                Struktur {h.name ?? h.id}:{" "}
                {h.remaining === null ? "unbegrenzt" : h.remaining.isZero() ? "Grenze erreicht – weitere Punkte zählen nicht" : `noch ${formatPoints(h.remaining)} P anrechenbar`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DecimalInput label="Zusätzliche eigene Punkte (ohne KV)" value={personal} onChange={setPersonal} suffix="P" />
        <DecimalInput label="Zusätzliche eigene KV-Punkte" value={personalKv} onChange={setPersonalKv} suffix="P" />
        {base.structures.map((s) => (
          <DecimalInput
            key={s.id}
            label={`Zusätzlich aus Struktur ${s.name ?? s.id}`}
            value={structures[s.id] ?? ""}
            onChange={(v) => setStructures((x) => ({ ...x, [s.id]: v }))}
            suffix="P"
          />
        ))}
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        <ProgressMeter label={`Simuliert: Punkte für ${target}`} achieved={sim.eligible} required={sim.required} />
        <ProgressMeter label="Simuliert: KV-Punkte" achieved={sim.eligibleKv} required={sim.kvRequired} unit="KV-P" />
        <p className={`text-sm font-semibold ${sim.isReady ? "text-color-success-text" : "text-color-text-secondary"}`}>
          {sim.isReady ? `Mit diesen Annahmen wäre die Qualifikation für ${target} erreicht.` : "Mit diesen Annahmen noch nicht qualifiziert."}
        </p>
      </div>
    </section>
  );
};
