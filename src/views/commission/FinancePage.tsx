"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { ErrorBlock } from "../../components/errorBlock/ErrorBlock";
import { EmployeePicker } from "../../components/employeePicker/EmployeePicker";
import { CurrencyInput, TextArea } from "../../components/formFields/FormFields";
import { InputField } from "../../components/inputField/InputField";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { ReasonConfirmForm, MIN_REASON_LENGTH } from "../../components/reasonConfirm/ReasonConfirmForm";
import { RoleGate } from "../../components/roleGate/RoleGate";
import { StatusBadge } from "../../components/statusBadge/StatusBadge";
import { MoneyValue, PointsValue } from "../../components/values/Values";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useEmployees } from "../../hooks/useEmployees/useEmployees";
import { logExport, useFinance, useLedgerEntries, type OverviewRow } from "../../hooks/useCommission/useCommission";
import { downloadCsv } from "../../utils/csvExport";
import { errorText } from "../../utils/dbErrors";
import { formatDate, formatDateTime, formatMoney, parseGermanDecimal } from "../../utils/format";
import { currentMonth, periodStatus } from "./CommissionPage";
import { overviewCsv } from "./statementCsv";

const NEXT_STEPS: Record<string, { status: string; label: string }[]> = {
  open: [{ status: "reviewed", label: "Zur Prüfung" }],
  reviewed: [
    { status: "approved", label: "Freigeben" },
    { status: "open", label: "Wieder öffnen" },
  ],
  approved: [{ status: "paid", label: "Als ausgezahlt markieren" }],
  paid: [],
};

const EXCEPTION_TEXT: Record<string, string> = {
  producer_without_level: "Produzent ohne Karrierestufe",
  ancestor_without_level: "Führungskraft in der Kette ohne Stufe",
  no_rules_for_date: "Keine Regeln für das Produktionsdatum",
  level_without_rate: "Stufe ohne Provisionssatz am Produktionsdatum",
};

/** Finance drill-down (§5.4): one recipient's bookings of the month. */
const RecipientEntries = ({ month, row }: { month: string; row: OverviewRow }) => {
  const { data = [], isLoading, error } = useLedgerEntries(month, row.recipient_id);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-color-text-secondary">
        {row.recipient_name} · Brutto {formatMoney(row.gross)} · Reserve {formatMoney(row.reserve)} · Nach Reserve {formatMoney(row.net)}
      </p>
      <DataTable
        rows={data}
        getRowId={(e) => e.id!}
        caption="Buchungen"
        isLoading={isLoading}
        error={error ? errorText(error) : null}
        emptyMessage="Keine Buchungen in diesem Monat"
        paginate={false}
        columns={[
          { id: "date", header: "Produktion", cell: (e) => formatDate(e.production_date) },
          { id: "producer", header: "Von", cell: (e) => e.producer_name },
          { id: "type", header: "Art", cell: (e) => `${e.commission_type === "personal" ? "Eigen" : "Differenz"}${e.entry_kind === "reversal" ? " (Rückbuchung)" : ""}` },
          { id: "points", header: "Punkte", align: "right", cell: (e) => <PointsValue value={e.points} /> },
          { id: "gross", header: "Brutto", align: "right", cell: (e) => <MoneyValue value={e.gross_amount} /> },
          { id: "net", header: "Nach Reserve", align: "right", cell: (e) => <MoneyValue value={e.net_after_reserve} /> },
        ]}
      />
    </div>
  );
};

/**
 * Finance workspace: month workflow, overview + export, subsidies and the
 * exception queue. Every write needs finance/admin with MFA (checked again
 * in the database).
 */
export const FinancePage = () => {
  const { permissions } = usePermissions();
  const allowed = permissions.isFinance || permissions.isAdmin;
  const canWrite = allowed && permissions.hasMfa;
  const { openModal, closeModal } = useModal();
  const { showBanner } = useBanner();
  const [month, setMonth] = useState(currentMonth());
  const { overview, period, exceptions, setStatus, setSubsidy, retry, dismiss, revokeSubsidy } = useFinance(month, allowed);
  const { data: employees = [] } = useEmployees();

  const [subEmployee, setSubEmployee] = useState<string | null | undefined>(undefined);
  const [subAmount, setSubAmount] = useState("");
  const [subNote, setSubNote] = useState("");
  const [subReason, setSubReason] = useState("");
  const [subOverride, setSubOverride] = useState("");
  const [subError, setSubError] = useState<string>();

  const changeStatus = (status: string, label: string) =>
    openModal({
      title: label,
      children: (
        <ReasonConfirmForm
          message={
            status === "approved"
              ? `Nach der Freigabe ist der Monat unveränderlich; spätere Korrekturen werden im nächsten offenen Monat gebucht.${
                  (exceptions.data?.length ?? 0) > 0 ? ` Achtung: ${exceptions.data!.length} offene Prüffälle werden erst nach ihrer Klärung gebucht – in einem späteren Monat.` : ""
                }`
              : `Status des Monats wird auf „${periodStatus[status as keyof typeof periodStatus].label}“ gesetzt.`
          }
          confirmText={label}
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await setStatus.mutateAsync({ status, reason });
            closeModal();
          }}
        />
      ),
    });

  const exportOverview = async () => {
    const rows = overview.data ?? [];
    try {
      await logExport("statement_overview", month, rows.length);
      downloadCsv(overviewCsv(rows), `abrechnung_${month.slice(0, 7)}.csv`);
    } catch (e) {
      showBanner("Export fehlgeschlagen", errorText(e), "error");
    }
  };

  const saveSubsidy = async () => {
    const amount = parseGermanDecimal(subAmount);
    if (!subEmployee) return setSubError("Bitte eine Person wählen.");
    if (amount === null) return setSubError("Bitte den Betrag als Zahl angeben.");
    if (subNote.trim().length < 3) return setSubError("Bitte die Deckungsgrundlage beschreiben.");
    if (subReason.trim().length < MIN_REASON_LENGTH) return setSubError(`Bitte eine Begründung mit mindestens ${MIN_REASON_LENGTH} Zeichen.`);
    setSubError(undefined);
    try {
      await setSubsidy.mutateAsync({
        employeeId: subEmployee, amount, note: subNote, reason: subReason, override: subOverride.trim() || null,
      });
      showBanner("Zuschuss gespeichert", "", "success");
      setSubAmount(""); setSubNote(""); setSubReason(""); setSubOverride("");
    } catch (e) {
      setSubError(errorText(e));
    }
  };

  const status = period.data ?? "open";
  const openEntries = (row: OverviewRow) =>
    openModal({ title: `Buchungen ${month.slice(5, 7)}/${month.slice(0, 4)}`, size: "large", children: <RecipientEntries month={month} row={row} /> });
  const revoke = (row: OverviewRow) =>
    openModal({
      title: "Zuschuss zurücknehmen",
      children: (
        <ReasonConfirmForm
          message={`Der genehmigte Zuschuss von ${formatMoney(row.subsidy ?? 0)} für ${row.recipient_name} wird für diesen Monat zurückgenommen.`}
          confirmText="Zurücknehmen"
          variant="decline"
          onCancel={closeModal}
          onConfirm={async (reason) => {
            await revokeSubsidy.mutateAsync({ employeeId: row.recipient_id, reason });
            closeModal();
          }}
        />
      ),
    });
  const employeeName = (id: string | undefined) => {
    const e = id ? employees.find((x) => x.id === id) : undefined;
    return e ? `${e.first_name} ${e.last_name}` : "–";
  };

  return (
    <RoleGate when={allowed} fallback={<EmptyState message="Nur für Finanzen und Verwaltung." />}>
      <div className="flex flex-col gap-4">
        {!permissions.hasMfa && <MfaRequiredNotice />}

        <section className="flex flex-wrap items-end justify-between gap-3 ui-card p-4 sm:p-5">
          <label className="flex flex-col gap-1 text-sm font-semibold text-color-text-secondary">
            Abrechnungsmonat
            <input
              type="month"
              value={month.slice(0, 7)}
              onChange={(e) => e.target.value && setMonth(`${e.target.value}-01`)}
              className="ui-input"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {period.error ? (
              <span role="alert" className="text-sm text-color-error-text">Monatsstatus nicht geladen: {errorText(period.error)}</span>
            ) : (
              <StatusBadge status={status} map={periodStatus} />
            )}
            {!period.error && NEXT_STEPS[status]?.map((s) => (
              <Button key={s.status} text={s.label} size="small" variant={s.status === "open" ? "secondary" : "primary"}
                isDisabled={!canWrite} onClick={() => changeStatus(s.status, s.label)} />
            ))}
            <Button text="CSV" size="small" variant="secondary" onClick={exportOverview} isDisabled={!canWrite || !overview.data?.length} />
          </div>
        </section>

        <DataTable
          rows={overview.data ?? []}
          getRowId={(r) => r.recipient_id}
          caption="Abrechnungsübersicht"
          isLoading={overview.isLoading}
          error={overview.error ? errorText(overview.error) : null}
          emptyMessage="Keine Buchungen oder Zuschüsse in diesem Monat"
          onRowClick={openEntries}
          columns={[
            { id: "name", header: "Name", cell: (r) => `${r.recipient_name} (${r.employee_no})`, sortValue: (r) => r.recipient_name },
            { id: "entries", header: "Buchungen", align: "right", hideOnMobile: true, cell: (r) => r.entries },
            { id: "gross", header: "Brutto", align: "right", cell: (r) => <MoneyValue value={r.gross} />, sortValue: (r) => Number(r.gross) },
            { id: "reserve", header: "Reserve", align: "right", hideOnMobile: true, cell: (r) => <MoneyValue value={r.reserve} /> },
            { id: "net", header: "Nach Reserve", align: "right", cell: (r) => <MoneyValue value={r.net} /> },
            { id: "subsidy", header: "Zuschuss", align: "right", cell: (r) => (r.subsidy === null ? "–" : <MoneyValue value={r.subsidy} />) },
            {
              id: "actions", header: "", align: "right",
              cell: (r) => r.subsidy === null ? null : (
                // The row itself opens the bookings; the button must not bubble into that.
                <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Button text="Zuschuss zurücknehmen" size="small" variant="ghost" isDisabled={!canWrite} onClick={() => revoke(r)} />
                </span>
              ),
            },
          ]}
        />

        <section className="flex flex-col gap-3 ui-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Zuschuss für {month.slice(5, 7)}/{month.slice(0, 4)}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <EmployeePicker label="Person" employees={employees.filter((e) => e.status === "active")} value={subEmployee} onChange={setSubEmployee} />
            <CurrencyInput label="Genehmigter Betrag" value={subAmount} onChange={setSubAmount} hint="Höchstbetrag der Stufe ist eine Obergrenze, keine Zusage." />
          </div>
          <TextArea label="Deckungsgrundlage" value={subNote} onChange={setSubNote} rows={2} isRequired />
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField label="Begründung" placeholder="z. B. Monatsfreigabe Zuschuss" value={subReason} onChange={setSubReason} isRequired />
            <InputField label="Ausnahme-Begründung (optional)" placeholder="Nur über Höchstbetrag, FA oder Teilzeit" value={subOverride} onChange={setSubOverride} />
          </div>
          {subError && <p role="alert" className="text-sm text-color-error-text">{subError}</p>}
          <div><Button text="Zuschuss speichern" onClick={saveSubsidy} isDisabled={!canWrite} isLoading={setSubsidy.isPending} /></div>
        </section>

        <section className="ui-card p-4 sm:p-5">
          <h2 className="mb-3 text-base font-semibold">Prüfwarteschlange ({exceptions.data?.length ?? 0})</h2>
          {exceptions.error ? (
            <ErrorBlock variant="inline" message={errorText(exceptions.error)} onRetry={() => exceptions.refetch()} />
          ) : (exceptions.data ?? []).length === 0 ? (
            <p className="text-sm text-color-text-subtle">Keine offenen Fälle.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {exceptions.data!.map((x) => {
                const details = (x.details ?? {}) as { production_date?: string; producer_id?: string; missing?: string[] };
                return (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-color-border-light pb-2 last:border-0">
                  <span>
                    <span className="font-semibold">{EXCEPTION_TEXT[x.reason_code] ?? x.reason_code}</span>
                    <span className="block text-xs text-color-text-subtle">
                      {employeeName(details.producer_id)} · Produktionsdatum {details.production_date ? formatDate(details.production_date) : "–"} · seit {formatDateTime(x.created_at)}
                      {x.reason_code === "ancestor_without_level" && details.missing?.length ? ` · ohne Stufe: ${details.missing.map(employeeName).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Button text="Erneut buchen" size="small" variant="secondary" isDisabled={!canWrite}
                      onClick={async () => {
                        try {
                          const n = await retry.mutateAsync(x.entity_id);
                          showBanner("Gebucht", `${n} Buchungen erstellt.`, "success");
                        } catch (e) {
                          showBanner("Noch nicht buchbar", errorText(e), "error");
                        }
                      }} />
                    <Button text="Verwerfen" size="small" variant="decline" isDisabled={!canWrite}
                      onClick={() => openModal({
                        title: "Fall verwerfen",
                        children: <ReasonConfirmForm message="Für diese Berechnung wird keine Provision gebucht." confirmText="Verwerfen" variant="decline"
                          onCancel={closeModal} onConfirm={async (reason) => { await dismiss.mutateAsync({ id: x.id, reason }); closeModal(); }} />,
                      })} />
                  </span>
                </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </RoleGate>
  );
};
