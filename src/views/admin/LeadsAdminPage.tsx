"use client";

import { ScrollX } from "../../components/scrollX/ScrollX";
import { Pagination } from "../../components/pagination/Pagination";
import { usePagination } from "../../components/pagination/usePagination";
import { errorText } from "../../utils/dbErrors";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { cardClass } from "../../components/card/card.const";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { CurrencyInput, DateInput, TimeInput } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useAutoAssign, useLeadAdmin, useLeadConfig, useLeadSourceCosts, type LeadConfig } from "../../hooks/useLeads/useLeads";
import { REQUIRED_FIELD_LABEL } from "../../domain/leads";
import { berlinToday, formatDate, formatMoney, parseGermanDecimal } from "../../utils/format";
import { Select } from "../../components/select/Select";

const card = cardClass;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Lead configuration (§9.2, §9.3): everything Profina decides, nothing hard-coded. */
export const LeadsAdminPage = () => {
  const { permissions } = usePermissions();
  const { data: config } = useLeadConfig();
  if (!permissions.isAdmin) return <p className="text-sm">Nur für Administratoren.</p>;
  if (!config) return <LoadingState />;
  return (
    <div className="flex flex-col gap-4">
      {!permissions.hasMfa && <MfaRequiredNotice />}
      <SlaCard config={config} />
      <AutoAssignCard />
      <StagesCard config={config} />
      <SourcesCard config={config} />
      <HolidaysCard config={config} />
    </div>
  );
};

/** Validation messages of the SLA form, shown under each field instead of a silently disabled button (P4-UX-14). */
export function slaErrors(v: { hours: string; start: string; end: string; region: string }, days: number[]) {
  const hours = Number(v.hours.replace(",", "."));
  return {
    hours: !(hours > 0 && hours <= 400) ? "Bitte 1 bis 400 Geschäftsstunden angeben." : undefined,
    start: !v.start ? "Bitte eine Uhrzeit angeben." : undefined,
    end: !v.end ? "Bitte eine Uhrzeit angeben." : v.start && v.end <= v.start ? "Das Arbeitsende muss nach dem Arbeitsbeginn liegen." : undefined,
    region: !/^DE(-[A-Z]{2})?$/.test(v.region) ? "Format DE oder DE-BY." : undefined,
    days: days.length === 0 ? "Bitte mindestens einen Arbeitstag wählen." : undefined,
  };
}

const SlaCard = ({ config }: { config: LeadConfig }) => {
  const { permissions } = usePermissions();
  const { setSla } = useLeadAdmin();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [v, setV] = useState({
    hours: String(config.sla.first_contact_hours), start: config.sla.workday_start, end: config.sla.workday_end,
    region: config.sla.holiday_region, escalate: config.sla.escalate_to_manager,
  });
  const [days, setDays] = useState<number[]>(config.sla.workdays);
  const errors = slaErrors(v, days);
  const valid = Object.values(errors).every((e) => e === undefined);
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Erstkontakt-Frist (SLA)</h2>
      {config.sla.provisional && <ProvisionalRuleNotice decisionId="OD-19" text="Vorläufige Werte. Mit dem ersten Speichern gelten sie als von Profina festgelegt." />}
      <div className="grid gap-3 sm:grid-cols-4">
        <InputField label="Geschäftsstunden bis Erstkontakt" placeholder="8" value={v.hours} onChange={(x) => setV({ ...v, hours: x })} error={errors.hours} />
        <TimeInput label="Arbeitsbeginn" value={v.start} onChange={(x) => setV({ ...v, start: x })} error={errors.start} />
        <TimeInput label="Arbeitsende" value={v.end} onChange={(x) => setV({ ...v, end: x })} error={errors.end} />
        <InputField label="Feiertagsregion" placeholder="DE oder DE-BY" value={v.region} onChange={(x) => setV({ ...v, region: x.toUpperCase() })} error={errors.region} />
      </div>
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="mb-1 text-[14px] font-semibold text-color-text-secondary">Arbeitstage</legend>
        {WEEKDAYS.map((d, i) => (
          <label key={d} className="flex items-center gap-1">
            <input type="checkbox" checked={days.includes(i + 1)}
              onChange={(e) => setDays((x) => (e.target.checked ? [...x, i + 1].sort() : x.filter((k) => k !== i + 1)))} />
            {d}
          </label>
        ))}
      </fieldset>
      {errors.days && <p className="text-[0.8125rem] text-color-error-text">{errors.days}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.escalate} onChange={(e) => setV({ ...v, escalate: e.target.checked })} />
        Bei Überschreitung die Führungskraft benachrichtigen
      </label>
      <p className="text-xs text-color-text-subtle">Die Frist zählt ab Eingang des Leads. Offene Leads ohne Erstkontakt bekommen beim Speichern die neue Frist.</p>
      <div>
        <Button text="Speichern" isDisabled={!valid || !permissions.hasMfa} onClick={() => openModal({
          title: "Erstkontakt-Frist ändern",
          children: (
            // Errors stay inside the dialog (ReasonConfirmForm shows what onConfirm throws, P4-UX-15).
            <ReasonConfirmForm message="Die neue Frist gilt sofort für alle offenen Leads ohne Erstkontakt." onCancel={closeModal}
              onConfirm={async (reason) => {
                await setSla.mutateAsync({ value: {
                  first_contact_hours: Number(v.hours.replace(",", ".")), workday_start: v.start, workday_end: v.end, workdays: days,
                  holiday_region: v.region || "DE", escalate_to_manager: v.escalate,
                }, reason });
                closeModal();
                showBanner("Erstkontakt-Frist gespeichert", `${v.hours} Geschäftsstunden, ${v.start}–${v.end} Uhr.`, "success");
              }} />
          ),
        })} />
      </div>
    </section>
  );
};

/** Dialog text for a stage change: says what actually changes (P4-UX-16). */
export function stageChangeMessage(before: { required: string[]; skip: boolean; active: boolean }, after: { required: string[]; skip: boolean; active: boolean }) {
  const parts: string[] = [];
  if (before.active !== after.active) parts.push(after.active ? "Die Phase wird wieder aktiviert." : "Die Phase wird deaktiviert und kann nicht mehr gewählt werden.");
  if (before.skip !== after.skip) parts.push(after.skip ? "Die Phase darf übersprungen werden." : "Die Phase kann nur noch aus der Phase davor erreicht werden.");
  if ([...before.required].sort().join() !== [...after.required].sort().join()) parts.push("Die Pflichtfelder gelten für künftige Phasenwechsel.");
  return parts.join(" ");
}

const StagesCard = ({ config }: { config: LeadConfig }) => {
  const { permissions } = usePermissions();
  const { updateStage } = useLeadAdmin();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const fields = Object.keys(REQUIRED_FIELD_LABEL);
  const saved = (code: string) => {
    const s = config.stages.find((x) => x.code === code)!;
    return { required: s.required_fields, skip: s.allow_skip, active: s.active };
  };
  const [draft, setDraft] = useState(() => Object.fromEntries(config.stages.map((s) => [s.code, saved(s.code)])));
  const reset = (code: string) => setDraft((x) => ({ ...x, [code]: saved(code) }));
  const changed = (code: string) => stageChangeMessage(saved(code), draft[code]) !== "";
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Phasen und Pflichtfelder</h2>
      <ScrollX label="Phasen und Pflichtfelder">
        <table className="w-full min-w-[60rem] text-left text-xs">
          <thead>
            <tr>
              <th className="whitespace-nowrap p-1.5">Phase</th>
              {fields.map((f) => <th key={f} className="p-1.5 font-normal [hyphens:none]">{REQUIRED_FIELD_LABEL[f]}</th>)}
              <th className="whitespace-nowrap p-1.5">Überspringbar</th>
              <th className="whitespace-nowrap p-1.5">Aktiv</th>
              <th className="w-28 p-1.5"><span className="sr-only">Aktion</span></th>
            </tr>
          </thead>
          <tbody>
            {config.stages.map((s) => {
              const d = draft[s.code];
              const set = (patch: Partial<typeof d>) => setDraft((x) => ({ ...x, [s.code]: { ...x[s.code], ...patch } }));
              return (
                <tr key={s.code} className="border-t border-color-border-light">
                  <td className="whitespace-nowrap p-1.5 font-semibold">{s.name_de}</td>
                  {fields.map((f) => (
                    <td key={f} className="p-1.5 text-center">
                      <input type="checkbox" aria-label={`${s.name_de}: ${REQUIRED_FIELD_LABEL[f]}`} checked={d.required.includes(f)}
                        onChange={(e) => set({ required: e.target.checked ? [...d.required, f] : d.required.filter((k) => k !== f) })} />
                    </td>
                  ))}
                  <td className="p-1.5 text-center"><input type="checkbox" aria-label={`${s.name_de} überspringbar`} checked={d.skip} onChange={(e) => set({ skip: e.target.checked })} /></td>
                  <td className="p-1.5 text-center"><input type="checkbox" aria-label={`${s.name_de} aktiv`} checked={d.active} onChange={(e) => set({ active: e.target.checked })} /></td>
                  <td className="whitespace-nowrap p-1.5">
                    {changed(s.code) && (
                      <span className="flex gap-1">
                        <Button text="Speichern" size="small" isDisabled={!permissions.hasMfa} ariaLabel={`Phase ${s.name_de} speichern`}
                          onClick={() => openModal({
                            title: `Phase „${s.name_de}“ ändern`,
                            children: (
                              <ReasonConfirmForm message={stageChangeMessage(saved(s.code), d)} onCancel={closeModal}
                                onConfirm={async (reason) => {
                                  try {
                                    await updateStage.mutateAsync({ code: s.code, requiredFields: d.required, allowSkip: d.skip, active: d.active, reason });
                                  } catch (e) {
                                    reset(s.code); // the matrix shows the saved state again
                                    throw e;
                                  }
                                  closeModal();
                                  showBanner("Phase gespeichert", s.name_de, "success");
                                }} />
                            ),
                          })} />
                        <Button text="Verwerfen" size="small" variant="ghost" ariaLabel={`Änderung an ${s.name_de} verwerfen`} onClick={() => reset(s.code)} />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollX>
      <p className="text-xs text-color-text-subtle">„Überspringbar“ aus: Die Phase kann nur aus der direkt davor liegenden Phase erreicht werden.</p>
    </section>
  );
};

const SourcesCard = ({ config }: { config: LeadConfig }) => {
  const { permissions } = usePermissions();
  const { saveSource, setSourceCost } = useLeadAdmin();
  const { data: costs = [] } = useLeadSourceCosts(true);
  const costPages = usePagination(costs);
  const { showBanner } = useBanner();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("campaign");
  const [costSource, setCostSource] = useState(config.sources[0]?.id ?? "");
  const [month, setMonth] = useState(berlinToday().slice(0, 8) + "01");
  const [amount, setAmount] = useState("");
  const sourceName = new Map(config.sources.map((s) => [s.id, s.name]));
  // German input ("1.234,50") → "1234.50" before it reaches the numeric API parameter (P4-BUG-02).
  const parsedAmount = amount.trim() ? parseGermanDecimal(amount) : null;
  const amountError = amount.trim() && parsedAmount === null ? "Bitte einen Betrag wie 1.234,50 angeben." : undefined;
  const run = async (fn: () => Promise<unknown>, done: string, detail: string) => {
    try {
      await fn();
      showBanner(done, detail, "success");
    } catch (e) {
      showBanner("Nicht gespeichert", errorText(e), "error");
    }
  };
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Quellen und Kosten</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {config.sources.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className={s.active ? "" : "text-color-text-subtle line-through"}>{s.name}</span>
            <Button text={s.active ? "Deaktivieren" : "Aktivieren"} variant="ghost" size="small" isDisabled={!permissions.hasMfa}
              ariaLabel={`${s.name} ${s.active ? "deaktivieren" : "aktivieren"}`}
              onClick={() => run(() => saveSource.mutateAsync({ id: s.id, name: s.name, kind: s.kind, active: !s.active }),
                s.active ? "Quelle deaktiviert" : "Quelle aktiviert", s.name)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <InputField label="Neue Quelle" placeholder="z. B. Messe 2027" value={name} onChange={setName} />
        <Select label="Art" value={kind} onChange={setKind} options={[
          { value: "campaign", label: "Kampagne" }, { value: "referral", label: "Empfehlung" }, { value: "website", label: "Website" },
          { value: "own", label: "Eigener Kontakt" }, { value: "import", label: "Import" }, { value: "other", label: "Sonstiges" }]} />
        <Button text="Hinzufügen" isDisabled={name.trim().length < 2 || !permissions.hasMfa}
          onClick={() => run(async () => { await saveSource.mutateAsync({ id: null, name, kind, active: true }); setName(""); }, "Quelle angelegt", name.trim())} />
      </div>
      <h3 className="text-sm font-semibold">Kosten je Monat</h3>
      <div className="flex flex-wrap items-start gap-3">
        <Select label="Quelle" value={costSource} onChange={setCostSource} options={config.sources.map((s) => ({ value: s.id, label: s.name }))} />
        <DateInput label="Monat (erster Tag)" value={month} onChange={(d) => setMonth(d ? d.slice(0, 8) + "01" : "")} />
        <CurrencyInput label="Betrag" value={amount} onChange={setAmount} error={amountError} />
        <div className="self-end">
          <Button text="Speichern" isDisabled={!costSource || !month || Boolean(amountError) || !permissions.hasMfa}
            onClick={() => run(async () => { await setSourceCost.mutateAsync({ sourceId: costSource, month, amount: parsedAmount }); setAmount(""); },
              parsedAmount === null ? "Kosten entfernt" : "Kosten gespeichert",
              `${sourceName.get(costSource)} · ${formatDate(month).slice(3)}${parsedAmount === null ? "" : ` · ${formatMoney(parsedAmount)}`}`)} />
        </div>
      </div>
      <p className="text-xs text-color-text-subtle">Leerer Betrag löscht den Eintrag. Kosten pro Lead/Abschluss werden nur angezeigt, wenn für die Quelle Kosten erfasst sind.</p>
      {costs.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="text-xs">
            {costPages.pageItems.map((c) => <li key={`${c.source_id}-${c.month}`}>{formatDate(c.month).slice(3)} · {sourceName.get(c.source_id)} · {formatMoney(c.amount)}</li>)}
          </ul>
          <Pagination {...costPages.pagination} />
        </div>
      )}
    </section>
  );
};

const HolidaysCard = ({ config }: { config: LeadConfig }) => {
  const { permissions } = usePermissions();
  const { setHoliday } = useLeadAdmin();
  const { showBanner } = useBanner();
  const [day, setDay] = useState("");
  const [region, setRegion] = useState(config.sla.holiday_region);
  const [name, setName] = useState("");
  const upcoming = config.holidays.filter((h) => h.day >= berlinToday());
  const pages = usePagination(upcoming);
  const run = async (fn: () => Promise<unknown>, done: string, detail: string) => {
    try {
      await fn();
      showBanner(done, detail, "success");
    } catch (e) {
      showBanner("Nicht gespeichert", errorText(e), "error");
    }
  };
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Feiertage (für Geschäftsstunden)</h2>
      {/* One row per holiday so each "Entfernen" sits next to its own date (P4-UI-08). */}
      <ul className="flex flex-col divide-y divide-color-border-light text-sm">
        {pages.pageItems.map((h) => (
          <li key={`${h.day}-${h.region}`} className="flex items-center justify-between gap-2 py-1">
            <span><span className="tabular">{formatDate(h.day)}</span> · {h.name} <span className="text-xs text-color-text-subtle">{h.region}</span></span>
            <Button text="Entfernen" variant="ghost" size="small" isDisabled={!permissions.hasMfa} ariaLabel={`${h.name} am ${formatDate(h.day)} entfernen`}
              onClick={() => run(() => setHoliday.mutateAsync({ day: h.day, region: h.region, name: null }), "Feiertag entfernt", `${formatDate(h.day)} · ${h.name}`)} />
          </li>
        ))}
      </ul>
      <Pagination {...pages.pagination} />
      <div className="flex flex-wrap items-end gap-3">
        <DateInput label="Datum" value={day} onChange={setDay} />
        <InputField label="Region" placeholder="DE-BY" value={region} onChange={(x) => setRegion(x.toUpperCase())}
          error={region && !/^DE(-[A-Z]{2})?$/.test(region) ? "Format DE oder DE-BY." : undefined} />
        <InputField label="Bezeichnung" placeholder="z. B. Fronleichnam" value={name} onChange={setName} />
        <Button text="Hinzufügen" isDisabled={!day || name.trim().length < 2 || !/^DE(-[A-Z]{2})?$/.test(region) || !permissions.hasMfa}
          onClick={() => run(async () => { await setHoliday.mutateAsync({ day, region, name }); setName(""); setDay(""); }, "Feiertag eingetragen", `${formatDate(day)} · ${name.trim()}`)} />
      </div>
    </section>
  );
};

/** Optional auto-assignment (§9.3): pool leads → least-loaded member of the creator's structure. */
const AutoAssignCard = () => {
  const { permissions } = usePermissions();
  const { data, save } = useAutoAssign(true);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [max, setMax] = useState<string | null>(null);
  if (!data) return null;
  const maxValue = max ?? String(data.max_open_per_person);
  const maxError = /^\d+$/.test(maxValue) && Number(maxValue) >= 1 ? undefined : "Bitte eine ganze Zahl ab 1 angeben.";
  const confirm = (enabled: boolean) => openModal({
    title: enabled ? "Automatische Zuweisung einschalten" : "Automatische Zuweisung speichern",
    children: (
      <ReasonConfirmForm message="Gilt für neue und wartende Leads im Pool, die von Führungskräften angelegt wurden." onCancel={closeModal}
        onConfirm={async (reason) => {
          await save.mutateAsync({ enabled, maxOpen: Number(maxValue), reason });
          setMax(null);
          closeModal();
          showBanner("Automatische Zuweisung gespeichert", enabled ? `Eingeschaltet, höchstens ${maxValue} offene Leads pro Person.` : "Ausgeschaltet.", "success");
        }} />
    ),
  });
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Automatische Zuweisung</h2>
      <p className="text-sm text-color-text-secondary">
        {data.enabled ? "Eingeschaltet" : "Ausgeschaltet"}: Pool-Leads einer Führungskraft gehen an die Person ihrer Struktur mit den wenigsten offenen Leads
        (höchstens {data.max_open_per_person} offene Leads pro Person). Admin-Leads im Pool werden weiterhin von Hand verteilt.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <InputField label="Max. offene Leads pro Person" placeholder="30" value={maxValue} onChange={setMax} error={maxError} />
        <div className="flex gap-3 self-end">
          <Button text={data.enabled ? "Ausschalten" : "Einschalten"} variant={data.enabled ? "decline" : "approve"}
            isDisabled={Boolean(maxError) || !permissions.hasMfa} onClick={() => confirm(!data.enabled)} />
          {max !== null && <Button text="Grenze speichern" variant="secondary" isDisabled={Boolean(maxError) || !permissions.hasMfa} onClick={() => confirm(data.enabled)} />}
        </div>
      </div>
    </section>
  );
};
