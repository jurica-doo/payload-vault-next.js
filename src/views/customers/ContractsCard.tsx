"use client";

import { cardClass } from "../../components/card/card.const";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DateInput } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { useBanner } from "../../context/banner/BannerContext";
import { useModal } from "../../context/modal/ModalContext";
import { useRules } from "../../hooks/useRules/useRules";
import { useContracts, type ContractLink, type Customer } from "../../hooks/useCustomers/useCustomers";
import { formatDate, formatDateTime } from "../../utils/format";
import { Select } from "../leads/LeadForm";

const card = cardClass;

const STATUS: StatusMap<string> = {
  pending: { label: "in Bearbeitung", tone: "info" },
  active: { label: "aktiv", tone: "success" },
  cancelled: { label: "gekündigt", tone: "warning" },
  ended: { label: "beendet", tone: "neutral" },
  unknown: { label: "unbekannt", tone: "neutral" },
};

const dateLine = (k: ContractLink) => {
  const parts = [
    k.start_date && `Beginn ${formatDate(k.start_date)}`,
    k.renewal_date && `Hauptfälligkeit ${formatDate(k.renewal_date)}`,
    k.end_date && `Ende ${formatDate(k.end_date)}`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return `${parts.join(" · ")} (${k.date_source === "portal" ? "laut Vertragsportal" : "aus Unterlagen bestätigt"})`;
};

/**
 * Linked contracts (§10.1, §10.4). Synced contracts are read-only here: the
 * portal is the source. Manual dates must be confirmed from the documents.
 */
export const ContractsCard = ({ customer, canWork }: { customer: Customer; canWork: boolean }) => {
  const { data = [], archive, linkExternal } = useContracts(customer.id);
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [extId, setExtId] = useState(customer.external_id ?? "");
  const visible = data.filter((k) => !k.archived_at);

  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Verträge</h2>
        {canWork && (
          <button type="button" className="cursor-pointer text-sm font-semibold text-color-text-accent"
            onClick={() => openModal({ title: "Vertrag verknüpfen", size: "large", children: <ContractForm customerId={customer.id} onDone={closeModal} /> })}>
            Verknüpfen
          </button>
        )}
      </div>
      {visible.length === 0 ? <p className="text-sm text-color-text-subtle">Keine Verträge verknüpft.</p> : (
        <ul className="flex flex-col gap-2">
          {visible.map((k) => (
            <li key={k.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-color-border-light pb-2 text-sm last:border-0">
              <span>
                <span className="font-semibold">{k.product_name || k.category_code || "Vertrag"}</span>
                {k.insurer && <span> · {k.insurer}</span>}
                <span className="block text-xs text-color-text-subtle">
                  Nr. {k.external_contract_id} · {k.source_system === "manual" ? "manuell" : k.source_system}
                  {k.last_synced_at && ` · synchronisiert ${formatDateTime(k.last_synced_at)}`}
                </span>
                {dateLine(k) && <span className="block text-xs">{dateLine(k)}</span>}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={k.status} map={STATUS} />
                {k.deep_link && <a href={k.deep_link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold">Im Portal öffnen</a>}
                {canWork && !k.last_synced_at && (
                  <button type="button" className="cursor-pointer text-xs text-color-text-subtle" onClick={() => openModal({
                    title: "Verknüpfung entfernen",
                    children: (
                      <ReasonConfirmForm message="Die Verknüpfung wird archiviert, nicht gelöscht." onCancel={closeModal}
                        onConfirm={async (reason) => { await archive.mutateAsync({ id: k.id, reason }); closeModal(); }} />
                    ),
                  })}>Entfernen</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWork && (
        <div className="flex flex-wrap items-end gap-3 border-t border-color-border-light pt-3">
          <InputField label="Kundennummer im Vertragsportal" placeholder="für die automatische Zuordnung" value={extId} onChange={setExtId} />
          <Button text="Speichern" variant="secondary" isLoading={linkExternal.isPending} isDisabled={extId === (customer.external_id ?? "")}
            onClick={async () => {
              try {
                await linkExternal.mutateAsync({ sourceSystem: "portal", externalId: extId.trim() });
              } catch (e) {
                showBanner("Nicht gespeichert", e instanceof Error ? e.message : "", "error");
              }
            }} />
        </div>
      )}
    </section>
  );
};

const ContractForm = ({ customerId, onDone }: { customerId: string; onDone: () => void }) => {
  const { save } = useContracts(customerId);
  const { data: rules } = useRules();
  const { showBanner } = useBanner();
  const [f, setF] = useState({
    source_system: "manual", external_contract_id: "", category_code: "", product_name: "", insurer: "", status: "active",
    start_date: "", renewal_date: "", end_date: "", deep_link: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const hasDates = Boolean(f.start_date || f.renewal_date || f.end_date);
  const linkError = f.deep_link && !/^https:\/\/\S+$/.test(f.deep_link) ? "Nur https-Links" : undefined;
  return (
    <form className="flex flex-col gap-3 pt-2" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await save.mutateAsync({
          id: null, datesConfirmed: confirmed,
          data: {
            ...f, category_code: f.category_code || undefined, deep_link: f.deep_link || null,
            start_date: f.start_date || null, renewal_date: f.renewal_date || null, end_date: f.end_date || null,
          },
        });
        onDone();
      } catch (err) {
        showBanner("Nicht gespeichert", err instanceof Error ? err.message : "", "error");
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <InputField label="Vertragsnummer" placeholder="wie im Portal" value={f.external_contract_id} onChange={set("external_contract_id")} isRequired />
        <Select label="Quelle der Nummer" value={f.source_system} onChange={set("source_system")}
          options={[{ value: "manual", label: "Unterlagen" }, { value: "portal", label: "Vertragsportal" }]} />
        <Select label="Sparte" value={f.category_code} onChange={set("category_code")}
          options={[{ value: "", label: "–" }, ...(rules?.conversion?.rows ?? []).map((c) => ({ value: c.categoryCode, label: c.nameDe }))]} />
        <InputField label="Produkt" placeholder="optional" value={f.product_name} onChange={set("product_name")} />
        <InputField label="Versicherer" placeholder="optional" value={f.insurer} onChange={set("insurer")} />
        <Select label="Status" value={f.status} onChange={set("status")} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <DateInput label="Beginn" value={f.start_date} onChange={set("start_date")} />
        <DateInput label="Hauptfälligkeit" value={f.renewal_date} onChange={set("renewal_date")} />
        <DateInput label="Ende" value={f.end_date} onChange={set("end_date")} />
      </div>
      <InputField label="Link ins Vertragsportal" placeholder="https://…" value={f.deep_link} onChange={set("deep_link")} error={linkError} />
      {hasDates && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          Die Daten habe ich anhand der Vertragsunterlagen geprüft.
        </label>
      )}
      <div>
        <Button type="submit" text="Verknüpfen" isLoading={save.isPending}
          isDisabled={!f.external_contract_id.trim() || Boolean(linkError) || (hasDates && !confirmed)} />
      </div>
    </form>
  );
};
