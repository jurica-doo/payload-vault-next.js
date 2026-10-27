"use client";

import { errorText } from "../../utils/dbErrors";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { cardClass } from "../../components/card/card.const";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { CurrencyInput, DateInput } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useAutoAssign, useLeadAdmin, useLeadConfig, useLeadSourceCosts, type LeadConfig } from "../../hooks/useLeads/useLeads";
import { REQUIRED_FIELD_LABEL } from "../../domain/leads";
import { berlinToday, formatDate, formatMoney } from "../../utils/format";
import { Select } from "../leads/LeadForm";

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

const SlaCard = ({ config }: { config: LeadConfig }) => {
  const { setSla } = useLeadAdmin();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [v, setV] = useState({
    hours: String(config.sla.first_contact_hours), start: config.sla.workday_start, end: config.sla.workday_end,
    region: config.sla.holiday_region, escalate: config.sla.escalate_to_manager,
  });
  const [days, setDays] = useState<number[]>(config.sla.workdays);
  const hours = Number(v.hours.replace(",", "."));
  const valid = hours > 0 && hours <= 400 && /^\d{2}:\d{2}$/.test(v.start) && /^\d{2}:\d{2}$/.test(v.end) && v.start < v.end && days.length > 0;
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Erstkontakt-Frist (SLA)</h2>
      {config.sla.provisional && <ProvisionalRuleNotice decisionId="OD-19" text="Vorläufige Werte. Mit dem ersten Speichern gelten sie als von Profina festgelegt." />}
      <div className="grid gap-3 sm:grid-cols-4">
        <InputField label="Geschäftsstunden bis Erstkontakt" placeholder="8" value={v.hours} onChange={(x) => setV({ ...v, hours: x })} />
        <InputField label="Arbeitsbeginn" placeholder="09:00" value={v.start} onChange={(x) => setV({ ...v, start: x })} />
        <InputField label="Arbeitsende" placeholder="17:00" value={v.end} onChange={(x) => setV({ ...v, end: x })} />
        <InputField label="Feiertagsregion" placeholder="DE oder DE-BY" value={v.region} onChange={(x) => setV({ ...v, region: x.toUpperCase() })} />
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.escalate} onChange={(e) => setV({ ...v, escalate: e.target.checked })} />
        Bei Überschreitung die Führungskraft benachrichtigen
      </label>
      <p className="text-xs text-color-text-subtle">Die Frist zählt ab Eingang des Leads. Offene Leads ohne Erstkontakt bekommen beim Speichern die neue Frist.</p>
      <div>
        <Button text="Speichern" isDisabled={!valid} onClick={() => openModal({
          title: "Erstkontakt-Frist ändern",
          children: (
            <ReasonConfirmForm message="Die neue Frist gilt sofort für alle offenen Leads ohne Erstkontakt." onCancel={closeModal}
              onConfirm={async (reason) => {
                try {
                  await setSla.mutateAsync({ value: {
                    first_contact_hours: hours, workday_start: v.start, workday_end: v.end, workdays: days,
                    holiday_region: v.region || "DE", escalate_to_manager: v.escalate,
                  }, reason });
                  closeModal();
                } catch (e) {
                  showBanner("Nicht gespeichert", errorText(e), "error");
                }
              }} />
          ),
        })} />
      </div>
    </section>
  );
};

const StagesCard = ({ config }: { config: LeadConfig }) => {
  const { updateStage } = useLeadAdmin();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const fields = Object.keys(REQUIRED_FIELD_LABEL);
  const [draft, setDraft] = useState(() => Object.fromEntries(config.stages.map((s) => [s.code, { required: s.required_fields, skip: s.allow_skip, active: s.active }])));
  const changed = (code: string) => {
    const s = config.stages.find((x) => x.code === code)!;
    const d = draft[code];
    return d.skip !== s.allow_skip || d.active !== s.active || [...d.required].sort().join() !== [...s.required_fields].sort().join();
  };
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Phasen und Pflichtfelder</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr><th className="p-1">Phase</th>{fields.map((f) => <th key={f} className="p-1 font-normal">{REQUIRED_FIELD_LABEL[f]}</th>)}<th className="p-1">Überspringbar</th><th className="p-1">Aktiv</th><th /></tr></thead>
          <tbody>
            {config.stages.map((s) => {
              const d = draft[s.code];
              const set = (patch: Partial<typeof d>) => setDraft((x) => ({ ...x, [s.code]: { ...x[s.code], ...patch } }));
              return (
                <tr key={s.code} className="border-t border-color-border-light">
                  <td className="p-1 font-semibold">{s.name_de}</td>
                  {fields.map((f) => (
                    <td key={f} className="p-1 text-center">
                      <input type="checkbox" aria-label={`${s.name_de}: ${REQUIRED_FIELD_LABEL[f]}`} checked={d.required.includes(f)}
                        onChange={(e) => set({ required: e.target.checked ? [...d.required, f] : d.required.filter((k) => k !== f) })} />
                    </td>
                  ))}
                  <td className="p-1 text-center"><input type="checkbox" aria-label={`${s.name_de} überspringbar`} checked={d.skip} onChange={(e) => set({ skip: e.target.checked })} /></td>
                  <td className="p-1 text-center"><input type="checkbox" aria-label={`${s.name_de} aktiv`} checked={d.active} onChange={(e) => set({ active: e.target.checked })} /></td>
                  <td className="p-1">
                    {changed(s.code) && (
                      <button type="button" className="cursor-pointer font-semibold text-color-text-accent" onClick={() => openModal({
                        title: `Phase „${s.name_de}“ ändern`,
                        children: (
                          <ReasonConfirmForm message="Die Pflichtfelder gelten für künftige Phasenwechsel." onCancel={closeModal}
                            onConfirm={async (reason) => {
                              try {
                                await updateStage.mutateAsync({ code: s.code, requiredFields: d.required, allowSkip: d.skip, active: d.active, reason });
                                closeModal();
                              } catch (e) {
                                showBanner("Nicht gespeichert", errorText(e), "error");
                              }
                            }} />
                        ),
                      })}>Speichern</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-color-text-subtle">„Überspringbar“ aus: Die Phase kann nur aus der direkt davor liegenden Phase erreicht werden.</p>
    </section>
  );
};

const SourcesCard = ({ config }: { config: LeadConfig }) => {
  const { permissions } = usePermissions();
  const { saveSource, setSourceCost } = useLeadAdmin();
  const { data: costs = [] } = useLeadSourceCosts(true);
  const { showBanner } = useBanner();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("campaign");
  const [costSource, setCostSource] = useState(config.sources[0]?.id ?? "");
  const [month, setMonth] = useState(berlinToday().slice(0, 8) + "01");
  const [amount, setAmount] = useState("");
  const sourceName = new Map(config.sources.map((s) => [s.id, s.name]));
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { showBanner("Nicht gespeichert", errorText(e), "error"); }
  };
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Quellen und Kosten</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {config.sources.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span className={s.active ? "" : "text-color-text-subtle line-through"}>{s.name}</span>
            <button type="button" className="cursor-pointer text-xs font-semibold text-color-text-accent" disabled={!permissions.hasMfa}
              onClick={() => run(() => saveSource.mutateAsync({ id: s.id, name: s.name, kind: s.kind, active: !s.active }))}>
              {s.active ? "Deaktivieren" : "Aktivieren"}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <InputField label="Neue Quelle" placeholder="z. B. Messe 2027" value={name} onChange={setName} />
        <Select label="Art" value={kind} onChange={setKind} options={[
          { value: "campaign", label: "Kampagne" }, { value: "referral", label: "Empfehlung" }, { value: "website", label: "Website" },
          { value: "own", label: "Eigener Kontakt" }, { value: "import", label: "Import" }, { value: "other", label: "Sonstiges" }]} />
        <Button text="Hinzufügen" isDisabled={name.trim().length < 2 || !permissions.hasMfa}
          onClick={() => run(async () => { await saveSource.mutateAsync({ id: null, name, kind, active: true }); setName(""); })} />
      </div>
      <h3 className="text-sm font-semibold">Kosten je Monat</h3>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Quelle" value={costSource} onChange={setCostSource} options={config.sources.map((s) => ({ value: s.id, label: s.name }))} />
        <DateInput label="Monat (erster Tag)" value={month} onChange={(d) => setMonth(d ? d.slice(0, 8) + "01" : "")} />
        <CurrencyInput label="Betrag" value={amount} onChange={setAmount} />
        <Button text="Speichern" isDisabled={!costSource || !month || !permissions.hasMfa}
          onClick={() => run(async () => { await setSourceCost.mutateAsync({ sourceId: costSource, month, amount: amount || null }); setAmount(""); })} />
      </div>
      <p className="text-xs text-color-text-subtle">Leerer Betrag löscht den Eintrag. Kosten pro Lead/Abschluss werden nur angezeigt, wenn für die Quelle Kosten erfasst sind.</p>
      {costs.length > 0 && (
        <ul className="text-xs">
          {costs.slice(0, 24).map((c) => <li key={`${c.source_id}-${c.month}`}>{formatDate(c.month).slice(3)} · {sourceName.get(c.source_id)} · {formatMoney(c.amount)}</li>)}
        </ul>
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
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { showBanner("Nicht gespeichert", errorText(e), "error"); }
  };
  const upcoming = config.holidays.filter((h) => h.day >= berlinToday());
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Feiertage (für Geschäftsstunden)</h2>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {upcoming.map((h) => (
          <li key={`${h.day}-${h.region}`} className="flex items-center justify-between gap-2">
            <span>{formatDate(h.day)} · {h.name} <span className="text-xs text-color-text-subtle">{h.region}</span></span>
            <button type="button" className="cursor-pointer text-xs text-color-text-subtle" disabled={!permissions.hasMfa}
              onClick={() => run(() => setHoliday.mutateAsync({ day: h.day, region: h.region, name: null }))}>Entfernen</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <DateInput label="Datum" value={day} onChange={setDay} />
        <InputField label="Region" placeholder="DE-BY" value={region} onChange={(x) => setRegion(x.toUpperCase())} />
        <InputField label="Bezeichnung" placeholder="z. B. Fronleichnam" value={name} onChange={setName} />
        <Button text="Hinzufügen" isDisabled={!day || name.trim().length < 2 || !/^DE(-[A-Z]{2})?$/.test(region) || !permissions.hasMfa}
          onClick={() => run(async () => { await setHoliday.mutateAsync({ day, region, name }); setName(""); setDay(""); })} />
      </div>
    </section>
  );
};

/** Optional auto-assignment (§9.3): pool leads → least-loaded member of the creator's structure. */
const AutoAssignCard = () => {
  const { data, save } = useAutoAssign(true);
  const { openModal, closeModal } = useModal();
  const [max, setMax] = useState<string | null>(null);
  if (!data) return null;
  const maxValue = max ?? String(data.max_open_per_person);
  const confirm = (enabled: boolean) => openModal({
    title: enabled ? "Automatische Zuweisung einschalten" : "Automatische Zuweisung speichern",
    children: (
      <ReasonConfirmForm message="Gilt für neue und wartende Leads im Pool, die von Führungskräften angelegt wurden." onCancel={closeModal}
        onConfirm={async (reason) => { await save.mutateAsync({ enabled, maxOpen: Number(maxValue), reason }); setMax(null); closeModal(); }} />
    ),
  });
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Automatische Zuweisung</h2>
      <p className="text-sm text-color-text-secondary">
        {data.enabled ? "Eingeschaltet" : "Ausgeschaltet"}: Pool-Leads einer Führungskraft gehen an die Person ihrer Struktur mit den wenigsten offenen Leads
        (höchstens {data.max_open_per_person} offene Leads pro Person). Admin-Leads im Pool werden weiterhin von Hand verteilt.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <InputField label="Max. offene Leads pro Person" placeholder="30" value={maxValue} onChange={setMax} />
        <Button text={data.enabled ? "Ausschalten" : "Einschalten"} variant={data.enabled ? "decline" : "approve"} isDisabled={!(Number(maxValue) >= 1)}
          onClick={() => confirm(!data.enabled)} />
        {max !== null && <Button text="Grenze speichern" variant="secondary" isDisabled={!(Number(maxValue) >= 1)} onClick={() => confirm(data.enabled)} />}
      </div>
    </section>
  );
};
