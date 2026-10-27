"use client";

import { errorText } from "../../utils/dbErrors";
import { ButtonLink } from "../../components/button/ButtonLink";
import { LoadingState } from "../../components/loadingState/LoadingState";
import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { CalculationBreakdown } from "../../components/calculationBreakdown/CalculationBreakdown";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { StatusBadge, type StatusMap } from "../../components/statusBadge/StatusBadge";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { MoneyValue, PointsValue } from "../../components/values/Values";
import { useModal } from "../../context/modal/ModalContext";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { logExport, useLedgerEntries, useStatement, type LedgerEntry } from "../../hooks/useCommission/useCommission";
import { downloadCsv } from "../../utils/csvExport";
import { formatDate, formatMoney } from "../../utils/format";
import { ledgerCsv } from "./statementCsv";

export const periodStatus: StatusMap<"open" | "reviewed" | "approved" | "paid"> = {
  open: { label: "Offen", tone: "info" },
  reviewed: { label: "In Prüfung", tone: "warning" },
  approved: { label: "Freigegeben", tone: "success" },
  paid: { label: "Ausgezahlt", tone: "neutral" },
};

const BUCKETS = [
  { key: "personal", label: "Eigenproduktion" },
  { key: "direct", label: "Differenz direkte Struktur" },
  { key: "indirect", label: "Differenz indirekte Struktur" },
] as const;

export const currentMonth = () =>
  `${new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()).slice(0, 7)}-01`;

/**
 * Own commission statement (§6.3): own production, direct and indirect
 * differential and subsidy shown separately; gross, 10 % reserve and the
 * amount after reserve — never called take-home pay.
 */
export const CommissionPage = () => {
  const { permissions } = usePermissions();
  const { openModal } = useModal();
  const { showBanner } = useBanner();
  const [month, setMonth] = useState(currentMonth());
  const { data: statement, isLoading, error } = useStatement(month, null);
  const { data: entries = [], isLoading: entriesLoading } = useLedgerEntries(month, permissions.employeeId);

  const openEntry = (e: LedgerEntry) =>
    openModal({
      title: "Provisionsbuchung",
      size: "large",
      children: (
        <CalculationBreakdown
          inputs={[
            { label: "Produktion", value: `${formatDate(e.production_date)} · ${e.category_code} · ${e.producer_name}` },
            { label: "Stufen am Produktionsdatum", value: `${e.producer_level} → ${e.recipient_level}` },
            { label: "Punkte", value: <PointsValue value={e.points} /> },
            { label: e.commission_type === "personal" ? "Satz je Punkt" : "Differenzsatz je Punkt", value: formatMoney(e.rate_per_point) },
          ]}
          formula="Punkte × Satz = Brutto; Reserve = 10 % von Brutto"
          steps={[
            { label: "Brutto", value: <MoneyValue value={e.gross_amount} kind="brutto" /> },
            { label: "Reserve", value: <MoneyValue value={e.reserve_amount} kind="reserve" /> },
          ]}
          result={{ label: "Nach Reserve", value: <MoneyValue value={e.net_after_reserve} kind="nachReserve" /> }}
          ruleVersion={e.entry_kind === "reversal" ? "Rückbuchung (Storno oder Korrektur)" : undefined}
          provisionalNotice={e.commission_type === "differential" ? <ProvisionalRuleNotice decisionId="OD-05" /> : undefined}
        />
      ),
    });

  const exportCsv = async () => {
    try {
      await logExport("statement", month, entries.length);
      downloadCsv(ledgerCsv(entries), `provisionen_${month.slice(0, 7)}.csv`);
    } catch (e) {
      showBanner("Export fehlgeschlagen", errorText(e), "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-color-text-secondary">
          Abrechnungsmonat
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => e.target.value && setMonth(`${e.target.value}-01`)}
            className="ui-input"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {statement && <StatusBadge status={statement.period_status} map={periodStatus} />}
          {(permissions.isFinance || permissions.isAdmin) && (
            <ButtonLink href="/vertrieb/provisionen/abrechnung" text="Abrechnung (Finanzen)" />
          )}
          <Button text="CSV" variant="secondary" onClick={exportCsv} isDisabled={entries.length === 0} />
        </div>
      </div>

      {!permissions.employeeId ? (
        <EmptyState message="Persönliche Abrechnungen gibt es nur für aktive Mitarbeitende." />
      ) : isLoading ? (
        <LoadingState label="Abrechnung wird geladen…" />
      ) : error || !statement ? (
        <EmptyState message="Die Abrechnung konnte nicht geladen werden." hint={error ? errorText(error) : undefined} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Provision brutto" value={formatMoney(statement.total.gross)} />
            <KpiTile label="Reserve (10 %)" value={formatMoney(statement.total.reserve)} hint="Einbehalten für Stornos" />
            <KpiTile label="Nach Reserve" value={formatMoney(statement.total.net)} hint="Vor sonstigen Abzügen" />
            <KpiTile
              label="Zuschuss (genehmigt)"
              value={statement.subsidy ? formatMoney(statement.subsidy.approved) : "–"}
              hint={statement.subsidy?.max ? `Höchstbetrag der Stufe: ${formatMoney(statement.subsidy.max)}` : "Separat von der Provision"}
            />
          </div>

          <section className="ui-card p-4 sm:p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-color-border-light text-left text-color-text-secondary">
                  <th className="py-2 pr-3">Art</th>
                  <th className="py-2 pr-3 text-right">Brutto</th>
                  <th className="py-2 pr-3 text-right">Reserve</th>
                  <th className="py-2 pr-3 text-right">Nach Reserve</th>
                </tr>
              </thead>
              <tbody>
                {BUCKETS.map((b) => (
                  <tr key={b.key} className="border-b border-color-border-light">
                    <td className="py-2 pr-3">{b.label} <span className="text-xs text-color-text-subtle">({statement.buckets[b.key].entries})</span></td>
                    <td className="py-2 pr-3 text-right"><MoneyValue value={statement.buckets[b.key].gross} /></td>
                    <td className="py-2 pr-3 text-right"><MoneyValue value={statement.buckets[b.key].reserve} /></td>
                    <td className="py-2 pr-3 text-right"><MoneyValue value={statement.buckets[b.key].net} /></td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Summe Provision</td>
                  <td className="py-2 pr-3 text-right"><MoneyValue value={statement.total.gross} /></td>
                  <td className="py-2 pr-3 text-right"><MoneyValue value={statement.total.reserve} /></td>
                  <td className="py-2 pr-3 text-right"><MoneyValue value={statement.total.net} /></td>
                </tr>
              </tbody>
            </table>
          </section>

          <DataTable
            rows={entries}
            getRowId={(e) => e.id!}
            caption="Buchungen"
            isLoading={entriesLoading}
            emptyMessage="Keine Buchungen in diesem Monat"
            onRowClick={openEntry}
            columns={[
              { id: "date", header: "Produktion", cell: (e) => formatDate(e.production_date), sortValue: (e) => e.production_date ?? "" },
              { id: "producer", header: "Von", cell: (e) => e.producer_name, hideOnMobile: true },
              { id: "type", header: "Art", cell: (e) => `${e.commission_type === "personal" ? "Eigen" : "Differenz"}${e.entry_kind === "reversal" ? " (Rückbuchung)" : ""}` },
              { id: "points", header: "Punkte", align: "right", hideOnMobile: true, cell: (e) => <PointsValue value={e.points} /> },
              { id: "gross", header: "Brutto", align: "right", cell: (e) => <MoneyValue value={e.gross_amount} /> },
              { id: "net", header: "Nach Reserve", align: "right", cell: (e) => <MoneyValue value={e.net_after_reserve} /> },
            ]}
          />

          <ProvisionalRuleNotice decisionId="OD-05/OD-10" text="Differenzprovision nach Satzdifferenz (Stufenkette) und Reserve ohne automatische Freigabe sind noch nicht von Profina bestätigt." />
        </>
      )}
    </div>
  );
};
