"use client";

import { LoadingState } from "../../components/loadingState/LoadingState";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { InputField } from "../../components/inputField/InputField";
import { DateInput, DecimalInput, parseGermanDecimal } from "../../components/formFields/FormFields";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import {
  useRuleAdmin,
  type ConversionRow,
  type LevelRow,
  type RuleVersion,
} from "../../hooks/useRules/useRules";
import { formatDate, formatMoney, formatPercent, formatPoints } from "../../utils/format";

type Kind = "levels" | "conversion";

const berlinToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const firstOfNextMonth = () => {
  const [y, m] = berlinToday().split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
const toInput = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const fromInput = (s: string): number | null => {
  const parsed = parseGermanDecimal(s);
  return parsed === null ? null : Number(parsed);
};

const inForce = (versions: RuleVersion[], kind: Kind) =>
  versions
    .filter((v) => v.kind === kind && v.status === "published" && v.effective_from <= berlinToday())
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

/**
 * Versioned business rules (§1 "Configurable", "Historical integrity").
 * Published versions are read-only; changes go through a draft with a future
 * effective date, a diff against the version in force, and a reason.
 */
export const RulesAdminPage = () => {
  const { permissions } = usePermissions();
  const { data, isLoading, error } = useRuleAdmin();
  const canWrite = permissions.isAdmin && permissions.hasMfa;

  if (isLoading) return <LoadingState label="Regeln werden geladen…" />;
  if (error || !data) return <p className="text-sm text-color-error-text">{error?.message ?? "Fehler beim Laden."}</p>;

  return (
    <div className="flex flex-col gap-6">
      {permissions.isAdmin && !permissions.hasMfa && <MfaRequiredNotice />}
      <RuleSection kind="levels" title="Karrierestufen & Sätze" data={data} canWrite={canWrite} />
      <RuleSection kind="conversion" title="Punkteumrechnung" data={data} canWrite={canWrite} />
    </div>
  );
};

type AdminData = { versions: RuleVersion[]; levels: LevelRow[]; conversion: ConversionRow[] };

const RuleSection = ({ kind, title, data, canWrite }: { kind: Kind; title: string; data: AdminData; canWrite: boolean }) => {
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const { createDraft, publish, deleteDraft } = useRuleAdmin();
  const [label, setLabel] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(firstOfNextMonth());
  const [formError, setFormError] = useState<string>();

  const active = inForce(data.versions, kind);
  const draft = data.versions.find((v) => v.kind === kind && v.status === "draft");
  const history = data.versions.filter((v) => v.kind === kind);

  const create = async () => {
    if (label.trim() === "") return setFormError("Bitte eine Bezeichnung angeben.");
    setFormError(undefined);
    try {
      await createDraft.mutateAsync({ kind, label, effectiveFrom });
      setLabel("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : undefined);
    }
  };

  const openPublish = (version: RuleVersion) =>
    openModal({
      title: "Version veröffentlichen",
      children: (
        <ReasonConfirmForm
          message={`„${version.label}“ gilt ab ${formatDate(version.effective_from)}. Danach ist die Version unveränderlich.`}
          confirmText="Veröffentlichen"
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await publish.mutateAsync({ versionId: version.id, reason });
            closeModal();
            showBanner("Veröffentlicht", `${version.label} ab ${formatDate(version.effective_from)}`, "success");
          }}
        />
      ),
    });

  return (
    <section className="flex flex-col gap-4 ui-card p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {active && (
          <span className="text-sm text-color-text-subtle">
            Gültig: {active.label} (seit {formatDate(active.effective_from)})
          </span>
        )}
      </header>

      {active && (kind === "levels" ? (
        <LevelTable rows={data.levels.filter((l) => l.rule_version_id === active.id)} />
      ) : (
        <ConversionTable rows={data.conversion.filter((c) => c.rule_version_id === active.id)} aePerPoint={active.ae_per_point} />
      ))}

      {draft ? (
        <div className="flex flex-col gap-3 rounded-radius-md border border-dashed border-color-secondary/60 p-3">
          <p className="text-sm">
            <StatusBadge status="draft" map={{ draft: { label: "Entwurf", tone: "warning" } }} />{" "}
            <span className="font-semibold text-color-text-main">{draft.label}</span> – gültig ab {formatDate(draft.effective_from)}.
            Geänderte Werte sind markiert.
          </p>
          {kind === "levels" ? (
            <LevelDraftEditor
              draftId={draft.id}
              rows={data.levels.filter((l) => l.rule_version_id === draft.id)}
              activeRows={active ? data.levels.filter((l) => l.rule_version_id === active.id) : []}
              canWrite={canWrite}
            />
          ) : (
            <ConversionDraftEditor
              draft={draft}
              rows={data.conversion.filter((c) => c.rule_version_id === draft.id)}
              activeRows={active ? data.conversion.filter((c) => c.rule_version_id === active.id) : []}
              activeAe={active?.ae_per_point ?? null}
              canWrite={canWrite}
            />
          )}
          <div className="flex flex-wrap gap-3">
            <Button text="Veröffentlichen…" onClick={() => openPublish(draft)} isDisabled={!canWrite} />
            <Button
              text="Entwurf verwerfen"
              variant="decline"
              isDisabled={!canWrite}
              onClick={async () => {
                await deleteDraft.mutateAsync(draft.id);
                showBanner("Verworfen", draft.label, "success");
              }}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <InputField label="Neuer Entwurf" placeholder="z. B. Sätze ab 2027" value={label} onChange={setLabel} />
          <DateInput label="Gültig ab" value={effectiveFrom} min={berlinToday()} onChange={setEffectiveFrom} />
          <Button text="Entwurf anlegen" onClick={create} isDisabled={!canWrite} isLoading={createDraft.isPending} />
          {formError && <p role="alert" className="text-sm text-color-error-text sm:col-span-3">{formError}</p>}
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-color-text-subtle">Versionsverlauf ({history.length})</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {history.map((v) => (
            <li key={v.id}>
              {formatDate(v.effective_from)} – {v.label}{" "}
              <span className="text-xs text-color-text-subtle">({v.status === "published" ? "veröffentlicht" : "Entwurf"})</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
};

const th = "px-2 py-2 text-left font-semibold text-color-text-secondary";
const td = "px-2 py-2 tabular-nums";

const LevelTable = ({ rows }: { rows: LevelRow[] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-color-border-light">
          <th className={th}>Stufe</th><th className={th}>Satz/P</th><th className={th}>Max. Zuschuss</th>
          <th className={th}>Schwelle</th><th className={th}>KV-Anteil</th><th className={th}>Strukturgrenze</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-color-border-light last:border-0">
            <td className={td}><span className="font-semibold">{r.code}</span> <span className="text-xs text-color-text-subtle">{r.name_de}</span></td>
            <td className={td}>{formatMoney(r.point_rate)}</td>
            <td className={td}>{formatMoney(r.max_subsidy)}</td>
            <td className={td}>{formatPoints(r.threshold_points, 0)} P</td>
            <td className={td}>{formatPercent(r.kv_min_ratio)}</td>
            <td className={td}>{r.structure_cap_ratio === null ? "–" : formatPercent(r.structure_cap_ratio)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const FORMULA_TEXT: Record<string, string> = {
  lv_monthly_term: "Monatsbeitrag × 12 × Laufzeit ÷ Divisor",
  kv_monthly: "Monatsbeitrag ÷ Divisor",
  sach_annual_net: "Jahresnettobeitrag ÷ Divisor",
  none: "keine Punkte",
};

const ConversionTable = ({ rows, aePerPoint }: { rows: ConversionRow[]; aePerPoint: number | null }) => (
  <div className="flex flex-col gap-2">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-color-border-light">
          <th className={th}>Sparte</th><th className={th}>Formel</th><th className={th}>Divisor</th><th className={th}>Max. Laufzeit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-color-border-light last:border-0">
            <td className={td}>{r.category_code}</td>
            <td className={td}>{FORMULA_TEXT[r.formula_kind]}</td>
            <td className={td}>{r.divisor === null ? "–" : formatPoints(r.divisor, 0)}</td>
            <td className={td}>{r.max_term_years ? `${r.max_term_years} Jahre` : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="text-xs text-color-text-subtle">1 Punkt = {formatPoints(aePerPoint, 0)} AE</p>
  </div>
);

const changed = (a: unknown, b: unknown) => (a ?? null) !== (b ?? null);
const mark = (isChanged: boolean) => (isChanged ? "rounded-radius-sm bg-color-secondary/15" : "");

const LevelDraftEditor = ({
  draftId,
  rows,
  activeRows,
  canWrite,
}: {
  draftId: string;
  rows: LevelRow[];
  activeRows: LevelRow[];
  canWrite: boolean;
}) => {
  const { updateLevel } = useRuleAdmin();
  const { showBanner } = useBanner();
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const value = (r: LevelRow, field: keyof LevelRow) =>
    edits[r.code]?.[field as string] ?? toInput(r[field] as number | null);
  const set = (code: string, field: string) => (v: string) =>
    setEdits((e) => ({ ...e, [code]: { ...e[code], [field]: v } }));

  const save = async (r: LevelRow) => {
    const next: LevelRow = {
      ...r,
      point_rate: fromInput(value(r, "point_rate")) ?? r.point_rate,
      max_subsidy: fromInput(value(r, "max_subsidy")),
      threshold_points: fromInput(value(r, "threshold_points")) ?? r.threshold_points,
      kv_min_ratio: fromInput(value(r, "kv_min_ratio")) ?? r.kv_min_ratio,
      structure_cap_ratio: fromInput(value(r, "structure_cap_ratio")),
    };
    try {
      await updateLevel.mutateAsync({ versionId: draftId, row: next });
      setEdits((e) => ({ ...e, [r.code]: {} }));
    } catch (e) {
      showBanner("Nicht gespeichert", e instanceof Error ? e.message : "", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const a = activeRows.find((x) => x.code === r.code);
        return (
          <fieldset key={r.id} className="grid grid-cols-2 gap-2 border-b border-color-border-light pb-3 sm:grid-cols-6 sm:items-end">
            <legend className="col-span-full text-sm font-semibold">{r.code} – {r.name_de}</legend>
            <div className={mark(changed(r.point_rate, a?.point_rate))}><DecimalInput label="Satz/P" suffix="€" value={value(r, "point_rate")} onChange={set(r.code, "point_rate")} isReadOnly={!canWrite} /></div>
            <div className={mark(changed(r.max_subsidy, a?.max_subsidy))}><DecimalInput label="Max. Zuschuss" suffix="€" value={value(r, "max_subsidy")} onChange={set(r.code, "max_subsidy")} isReadOnly={!canWrite} /></div>
            <div className={mark(changed(r.threshold_points, a?.threshold_points))}><DecimalInput label="Schwelle P" value={value(r, "threshold_points")} onChange={set(r.code, "threshold_points")} isReadOnly={!canWrite} /></div>
            <div className={mark(changed(r.kv_min_ratio, a?.kv_min_ratio))}><DecimalInput label="KV-Anteil (0–1)" value={value(r, "kv_min_ratio")} onChange={set(r.code, "kv_min_ratio")} isReadOnly={!canWrite} /></div>
            <div className={mark(changed(r.structure_cap_ratio, a?.structure_cap_ratio))}><DecimalInput label="Strukturgrenze (0–1)" value={value(r, "structure_cap_ratio")} onChange={set(r.code, "structure_cap_ratio")} isReadOnly={!canWrite} /></div>
            <Button text="Speichern" size="small" variant="secondary" onClick={() => save(r)} isDisabled={!canWrite || !edits[r.code] || Object.keys(edits[r.code]).length === 0} />
          </fieldset>
        );
      })}
    </div>
  );
};

const ConversionDraftEditor = ({
  draft,
  rows,
  activeRows,
  activeAe,
  canWrite,
}: {
  draft: RuleVersion;
  rows: ConversionRow[];
  activeRows: ConversionRow[];
  activeAe: number | null;
  canWrite: boolean;
}) => {
  const { updateConversion } = useRuleAdmin();
  const { showBanner } = useBanner();
  const [edits, setEdits] = useState<Record<string, { divisor?: string; term?: string }>>({});
  const [ae, setAe] = useState(toInput(draft.ae_per_point));

  const save = async (r: ConversionRow) => {
    try {
      await updateConversion.mutateAsync({
        versionId: draft.id,
        row: {
          ...r,
          divisor: edits[r.category_code]?.divisor !== undefined ? fromInput(edits[r.category_code]!.divisor!) : r.divisor,
          max_term_years: edits[r.category_code]?.term !== undefined ? fromInput(edits[r.category_code]!.term!) : r.max_term_years,
        },
        aePerPoint: fromInput(ae),
      });
      setEdits((e) => ({ ...e, [r.category_code]: {} }));
    } catch (e) {
      showBanner("Nicht gespeichert", e instanceof Error ? e.message : "", "error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={`sm:w-48 ${mark(changed(draft.ae_per_point, activeAe))}`}>
        <DecimalInput label="AE je Punkt" value={ae} onChange={setAe} isReadOnly={!canWrite} />
      </div>
      {rows.filter((r) => r.formula_kind !== "none").map((r) => {
        const a = activeRows.find((x) => x.category_code === r.category_code);
        return (
          <fieldset key={r.id} className="grid grid-cols-2 gap-2 border-b border-color-border-light pb-3 sm:grid-cols-4 sm:items-end">
            <legend className="col-span-full text-sm font-semibold">{r.category_code} – {FORMULA_TEXT[r.formula_kind]}</legend>
            <div className={mark(changed(r.divisor, a?.divisor))}>
              <DecimalInput label="Divisor" value={edits[r.category_code]?.divisor ?? toInput(r.divisor)} onChange={(v) => setEdits((e) => ({ ...e, [r.category_code]: { ...e[r.category_code], divisor: v } }))} isReadOnly={!canWrite} />
            </div>
            {r.formula_kind === "lv_monthly_term" && (
              <div className={mark(changed(r.max_term_years, a?.max_term_years))}>
                <DecimalInput label="Max. Laufzeit (Jahre)" value={edits[r.category_code]?.term ?? toInput(r.max_term_years)} onChange={(v) => setEdits((e) => ({ ...e, [r.category_code]: { ...e[r.category_code], term: v } }))} isReadOnly={!canWrite} />
              </div>
            )}
            <Button text="Speichern" size="small" variant="secondary" onClick={() => save(r)} isDisabled={!canWrite} />
          </fieldset>
        );
      })}
      <p className="text-xs text-color-text-subtle">Sparten ohne Punkte (Kfz, Strom, Gas) sind bis zur Entscheidung OD-18 nicht änderbar.</p>
    </div>
  );
};
