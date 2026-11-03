"use client";

import { errorText } from "../../utils/dbErrors";
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
import { Select } from "../../components/select/Select";
import { Form } from "../../components/form/Form";

const card = cardClass;

const STATUS: StatusMap<string> = {
  pending: { label: "in Bearbeitung", tone: "info" },
  active: { label: "aktiv", tone: "success" },
  cancelled: { label: "gekündigt", tone: "warning" },
  ended: { label: "beendet", tone: "neutral" },
  unknown: { label: "unbekannt", tone: "neutral" },
};

/** Where a contract or a customer number comes from (P5-UI-02: no raw codes). */
export const SOURCE_SYSTEM_LABEL: Record<string, string> = { manual: "aus Unterlagen", portal: "Vertragsportal" };

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
  const { data: rules } = useRules();
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [extId, setExtId] = useState(customer.external_id ?? "");
  const visible = data.filter((k) => !k.archived_at);
  const categoryName = new Map((rules?.conversion?.rows ?? []).map((c) => [c.categoryCode, c.nameDe]));
  const title = (k: ContractLink) => k.product_name || (k.category_code && categoryName.get(k.category_code)) || "Vertrag";
  const form = (contract?: ContractLink) => openModal({
    title: contract ? "Vertrag bearbeiten" : "Vertrag verknüpfen", size: "large",
    children: <ContractForm customerId={customer.id} contract={contract} onDone={() => {
      closeModal();
      showBanner(contract ? "Vertrag gespeichert" : "Vertrag verknüpft", "Die Angaben sind übernommen.", "success");
    }} />,
  });

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Verträge</h2>
        {canWork && <Button text="Verknüpfen" variant="ghost" size="small" onClick={() => form()} />}
      </div>
      {visible.length === 0 ? <p className="text-sm text-color-text-subtle">Keine Verträge verknüpft.</p> : (
        <ul className="flex flex-col gap-2">
          {visible.map((k) => {
            const synced = Boolean(k.last_synced_at) || k.date_source === "portal";
            return (
              <li key={k.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-color-border-light pb-2 text-sm last:border-0">
                <span>
                  <span className="font-semibold">{title(k)}</span>
                  {k.insurer && <span> · {k.insurer}</span>}
                  <span className="block text-xs text-color-text-subtle">
                    Nr. {k.external_contract_id} · {SOURCE_SYSTEM_LABEL[k.source_system] ?? k.source_system}
                    {k.last_synced_at && ` · synchronisiert ${formatDateTime(k.last_synced_at)}`}
                  </span>
                  {dateLine(k) && <span className="block text-xs">{dateLine(k)}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={k.status} map={STATUS} />
                  {k.deep_link && <a href={k.deep_link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold">Im Portal öffnen</a>}
                  {canWork && !synced && (
                    <>
                      <Button text="Bearbeiten" variant="ghost" size="small" ariaLabel={`Vertrag ${k.external_contract_id} bearbeiten`} onClick={() => form(k)} />
                      <Button text="Entfernen" variant="ghost" size="small" ariaLabel={`Vertrag ${k.external_contract_id} entfernen`} onClick={() => openModal({
                        title: "Verknüpfung entfernen",
                        children: (
                          <ReasonConfirmForm message="Die Verknüpfung wird archiviert, nicht gelöscht." onCancel={closeModal}
                            onConfirm={async (reason) => {
                              await archive.mutateAsync({ id: k.id, reason });
                              closeModal();
                              showBanner("Verknüpfung entfernt", `Nr. ${k.external_contract_id}`, "success");
                            }} />
                        ),
                      })} />
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {canWork && (
        <div className="flex flex-wrap items-end gap-3 border-t border-color-border-light pt-3">
          <InputField label="Kundennummer im Vertragsportal" placeholder="für die automatische Zuordnung" value={extId} onChange={setExtId} />
          <Button text="Speichern" variant="secondary" isLoading={linkExternal.isPending} isDisabled={extId === (customer.external_id ?? "")}
            onClick={async () => {
              try {
                await linkExternal.mutateAsync({ sourceSystem: "portal", externalId: extId.trim() });
                showBanner("Portalnummer gespeichert", extId.trim() || "entfernt", "success");
              } catch (e) {
                showBanner("Nicht gespeichert", errorText(e), "error");
              }
            }} />
        </div>
      )}
    </section>
  );
};

/** Manual link or edit. Manual contracts are always „aus Unterlagen“; the portal source is set by the sync (P5-UX-06). */
const ContractForm = ({ customerId, contract, onDone }: { customerId: string; contract?: ContractLink; onDone: () => void }) => {
  const { save } = useContracts(customerId);
  const { data: rules } = useRules();
  const { showBanner } = useBanner();
  const [f, setF] = useState({
    external_contract_id: contract?.external_contract_id ?? "", category_code: contract?.category_code ?? "",
    product_name: contract?.product_name ?? "", insurer: contract?.insurer ?? "", status: contract?.status ?? "active",
    start_date: contract?.start_date ?? "", renewal_date: contract?.renewal_date ?? "", end_date: contract?.end_date ?? "",
    deep_link: contract?.deep_link ?? "",
  });
  const [confirmed, setConfirmed] = useState(Boolean(contract?.date_source));
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const hasDates = Boolean(f.start_date || f.renewal_date || f.end_date);
  const linkError = f.deep_link && !/^https:\/\/\S+$/.test(f.deep_link) ? "Nur https-Links" : undefined;
  const dateError = f.start_date && f.end_date && f.end_date < f.start_date ? "Das Ende darf nicht vor dem Beginn liegen." : undefined;
  return (
    <Form className="flex flex-col gap-3 pt-2" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await save.mutateAsync({
          id: contract?.id ?? null, datesConfirmed: confirmed,
          data: {
            ...f, category_code: f.category_code || undefined, deep_link: f.deep_link || null,
            start_date: f.start_date || null, renewal_date: f.renewal_date || null, end_date: f.end_date || null,
          },
        });
        onDone();
      } catch (err) {
        showBanner("Nicht gespeichert", errorText(err), "error");
      }
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <InputField label="Vertragsnummer" placeholder="wie in den Unterlagen" value={f.external_contract_id} onChange={set("external_contract_id")} isRequired />
        <Select label="Sparte" value={f.category_code} onChange={set("category_code")}
          options={[{ value: "", label: "–" }, ...(rules?.conversion?.rows ?? []).map((c) => ({ value: c.categoryCode, label: c.nameDe }))]} />
        <Select label="Status" value={f.status} onChange={set("status")} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <InputField label="Produkt" placeholder="optional" value={f.product_name} onChange={set("product_name")} />
        <InputField label="Versicherer" placeholder="optional" value={f.insurer} onChange={set("insurer")} />
        <span />
        <DateInput label="Beginn" value={f.start_date} onChange={set("start_date")} />
        <DateInput label="Hauptfälligkeit" value={f.renewal_date} onChange={set("renewal_date")} />
        <DateInput label="Ende" value={f.end_date} onChange={set("end_date")} min={f.start_date || undefined} error={dateError} />
      </div>
      <InputField label="Link ins Vertragsportal" placeholder="https://…" value={f.deep_link} onChange={set("deep_link")} error={linkError} />
      {hasDates && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          Die Daten habe ich anhand der Vertragsunterlagen geprüft.
        </label>
      )}
      <div>
        <Button type="submit" text={contract ? "Speichern" : "Verknüpfen"} isLoading={save.isPending}
          isDisabled={!f.external_contract_id.trim() || Boolean(linkError) || Boolean(dateError) || (hasDates && !confirmed)} />
      </div>
    </Form>
  );
};
