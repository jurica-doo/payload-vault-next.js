"use client";

import { useState, type ReactNode } from "react";
import {
  AeValue,
  MoneyValue,
  PointsValue,
} from "../../components/values/Values";
import {
  StatusBadge,
  type StatusMap,
} from "../../components/statusBadge/StatusBadge";
import { KpiTile } from "../../components/kpiTile/KpiTile";
import { ProgressMeter } from "../../components/progressMeter/ProgressMeter";
import { CalculationBreakdown } from "../../components/calculationBreakdown/CalculationBreakdown";
import { ProvisionalRuleNotice } from "../../components/provisionalRuleNotice/ProvisionalRuleNotice";
import { DataTable } from "../../components/dataTable/DataTable";
import {
  CurrencyInput,
  DateInput,
  TextArea,
  parseGermanDecimal,
} from "../../components/formFields/FormFields";
import { ReasonConfirmForm } from "../../components/reasonConfirm/ReasonConfirmForm";
import { AuditTimeline } from "../../components/auditTimeline/AuditTimeline";
import { StageStepper } from "../../components/stageStepper/StageStepper";
import {
  HierarchyTree,
  type TreeNode,
} from "../../components/hierarchyTree/HierarchyTree";
import { FunnelChart } from "../../components/charts/FunnelChart";
import { TrendChart } from "../../components/charts/TrendChart";
import {
  PeriodSelector,
  periodToRange,
  type Period,
} from "../../components/periodSelector/PeriodSelector";
import { Button } from "../../components/button/Button";
import { useModal } from "../../context/modal/ModalContext";

const ledgerStatus: StatusMap<"calculated" | "approved" | "disputed"> = {
  calculated: { label: "Berechnet", tone: "info" },
  approved: { label: "Freigegeben", tone: "success" },
  disputed: { label: "Strittig", tone: "error" },
};

type LedgerRow = {
  id: string;
  recipient: string;
  type: string;
  gross: string;
  status: string;
};
const ledgerRows: LedgerRow[] = [
  {
    id: "1",
    recipient: "FB Fritz",
    type: "Eigenproduktion",
    gross: "560.00",
    status: "approved",
  },
  {
    id: "2",
    recipient: "FB Fritz",
    type: "Differenz (FA Anna)",
    gross: "280.00",
    status: "calculated",
  },
  {
    id: "3",
    recipient: "TL Tim",
    type: "Differenz (FB Fritz)",
    gross: "140.00",
    status: "calculated",
  },
  {
    id: "4",
    recipient: "DL Dora",
    type: "Storno",
    gross: "-420.00",
    status: "disputed",
  },
];

const tree: Record<string, TreeNode[]> = {
  root: [{ id: "dl", label: "DL Dora", hasChildren: true, meta: "1.520 P" }],
  dl: [
    { id: "tl", label: "TL Tim", hasChildren: true, meta: "380 P" },
    { id: "tl2", label: "TL Tara", hasChildren: false, meta: "310 P" },
  ],
  tl: [{ id: "fb", label: "FB Fritz", hasChildren: true, meta: "120 P" }],
  fb: [{ id: "fa", label: "FA Anna", hasChildren: false, meta: "10 P" }],
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-3 rounded-radius-lg border border-color-border-light p-4">
    <h2 className="text-lg font-bold text-color-text-main">{title}</h2>
    {children}
  </section>
);

export const DevUiPage = () => {
  const { openModal, closeModal } = useModal();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["dl"]));
  const [selected, setSelected] = useState<string>();
  const [premium, setPremium] = useState("100,00");
  const [date, setDate] = useState("2026-11-01");
  const [note, setNote] = useState("");
  const [period, setPeriod] = useState<Period>({
    kind: "month",
    year: 2026,
    month: 10,
  });

  const parsed = parseGermanDecimal(premium);
  const range = periodToRange(period);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-color-text-main">
        UI-Kit (nur Entwicklung)
      </h1>

      <Section title="Werte & Status">
        <div className="flex flex-wrap gap-4">
          <MoneyValue value="560" kind="brutto" />
          <MoneyValue value="56" kind="reserve" />
          <MoneyValue value="504" kind="nachReserve" />
          <MoneyValue value="-420" />
          <PointsValue value="10.5" />
          <PointsValue value="25" isKv />
          <AeValue value="294" />
          <StatusBadge status="approved" map={ledgerStatus} />
          <StatusBadge status="disputed" map={ledgerStatus} />
          <StatusBadge status="unknown_status" map={ledgerStatus} />
        </div>
        <ProvisionalRuleNotice decisionId="OD-05" />
      </Section>

      <Section title="KPI & Fortschritt">
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiTile
            label="Punkte (Monat)"
            value={<PointsValue value="42.5" />}
            delta={{ ratio: 0.12, comparedTo: "ggü. Vormonat" }}
          />
          <KpiTile
            label="Überfällige Aufgaben"
            value="5"
            delta={{
              ratio: 0.5,
              comparedTo: "ggü. Vorwoche",
              goodWhen: "down",
            }}
          />
          <KpiTile
            label="Prognose Monatsende"
            value={<PointsValue value="61" />}
            isEstimate
            hint="Basis: Tempo der letzten 30 Tage"
          />
        </div>
        <ProgressMeter label="Punkte bis FB" achieved="100" required="100" />
        <ProgressMeter
          label="KV-Punkte bis FB"
          achieved="7"
          required="10"
          unit="KV-P"
          expected="8"
        />
        <ProgressMeter
          label="Punkte bis OL"
          achieved="300"
          required="750"
          markers={[{ value: "375", label: "50 %-Grenze je Struktur" }]}
          expected="400"
        />
        <div>
          <Button
            text="Berechnung anzeigen"
            onClick={() =>
              openModal({
                title: "Woher kommt diese Zahl?",
                size: "large",
                children: (
                  <CalculationBreakdown
                    inputs={[
                      { label: "Produkt", value: "LV" },
                      {
                        label: "Monatsbeitrag",
                        value: <MoneyValue value="100" />,
                      },
                      { label: "Laufzeit", value: "35 Jahre" },
                    ]}
                    formula="Monatsbeitrag × 12 × Laufzeit ÷ 4.000"
                    steps={[
                      {
                        label: "Beitragssumme",
                        value: <MoneyValue value="42000" />,
                      },
                    ]}
                    result={{
                      label: "Punkte",
                      value: <PointsValue value="10.5" />,
                    }}
                    ruleVersion="Umrechnung LV · gültig ab 01.01.2026"
                    sources={[
                      {
                        label: "Produktion #123",
                        href: "/vertrieb/produktion",
                      },
                    ]}
                  />
                ),
              })
            }
          />
        </div>
      </Section>

      <Section title="Tabelle">
        <DataTable
          rows={ledgerRows}
          getRowId={(r) => r.id}
          caption="Provisionsbuchungen"
          columns={[
            {
              id: "recipient",
              header: "Empfänger",
              cell: (r) => r.recipient,
              sortValue: (r) => r.recipient,
            },
            {
              id: "type",
              header: "Art",
              cell: (r) => r.type,
              hideOnMobile: true,
            },
            {
              id: "gross",
              header: "Brutto",
              cell: (r) => <MoneyValue value={r.gross} />,
              sortValue: (r) => Number(r.gross),
              align: "right",
            },
            {
              id: "status",
              header: "Status",
              cell: (r) => <StatusBadge status={r.status} map={ledgerStatus} />,
            },
          ]}
          pagination={{
            page: 1,
            pageSize: 25,
            total: ledgerRows.length,
            onPageChange: () => {},
          }}
        />
        <DataTable
          rows={[]}
          columns={[]}
          getRowId={() => ""}
          emptyMessage="Keine Leads"
          emptyHint="Leads erscheinen hier nach der Zuweisung."
        />
        <DataTable
          rows={[]}
          columns={[{ id: "a", header: "A", cell: () => null }]}
          getRowId={() => ""}
          isLoading
        />
      </Section>

      <Section title="Formular">
        <div className="grid gap-3 sm:grid-cols-2">
          <CurrencyInput
            label="Monatsbeitrag"
            value={premium}
            onChange={setPremium}
            isRequired
            error={
              parsed === null
                ? "Bitte eine Zahl eingeben, z. B. 1.234,56"
                : undefined
            }
            hint={parsed ? `API-Wert: ${parsed}` : undefined}
          />
          <DateInput label="Produktionsdatum" value={date} onChange={setDate} />
        </div>
        <TextArea
          label="Notiz"
          value={note}
          onChange={setNote}
          maxLength={500}
        />
        <div>
          <Button
            text="Lead neu zuweisen…"
            variant="secondary"
            onClick={() =>
              openModal({
                title: "Lead neu zuweisen",
                children: (
                  <ReasonConfirmForm
                    message="Der Lead wird an FB Fritz übertragen."
                    onConfirm={async () => closeModal()}
                    onCancel={closeModal}
                  />
                ),
              })
            }
          />
        </div>
      </Section>

      <Section title="Struktur">
        <HierarchyTree
          roots={tree.root}
          childrenOf={(id) => tree[id]}
          expandedIds={expanded}
          onToggle={(id, open) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (open) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          selectedId={selected}
          onSelect={(n) => setSelected(n.id)}
        />
      </Section>

      <Section title="Pipeline & Verlauf">
        <StageStepper
          stages={[
            { id: "new", label: "Neu" },
            { id: "contacted", label: "Kontaktiert" },
            { id: "appointment", label: "Termin" },
            { id: "offer", label: "Angebot" },
          ]}
          currentId="appointment"
        />
        <StageStepper
          stages={[
            { id: "new", label: "Neu" },
            { id: "contacted", label: "Kontaktiert" },
            { id: "offer", label: "Angebot" },
          ]}
          currentId="contacted"
          outcome={{ label: "Verloren", tone: "error" }}
        />
        <AuditTimeline
          entries={[
            {
              id: "1",
              at: "2026-10-26T09:00:00Z",
              actorName: "Admin Ada",
              action: "hat die Führungskraft geändert",
              reason: "Wechsel ins Team Nord",
              changes: [
                {
                  field: "manager",
                  label: "Führungskraft",
                  from: "TL Tim",
                  to: "TL Tara",
                },
              ],
            },
            {
              id: "2",
              at: "2026-10-25T23:15:00Z",
              actorName: null,
              action: "hat die Karriereperiode abgeschlossen",
            },
          ]}
        />
      </Section>

      <Section title="Diagramme & Zeitraum">
        <FunnelChart
          window="01.10.2026 – 31.10.2026"
          attributionNote="Abschlüsse werden dem letzten gehaltenen Termin zugeordnet."
          steps={[
            { id: "leads", label: "Leads", count: 50 },
            { id: "booked", label: "Termin vereinbart", count: 26 },
            { id: "held", label: "Termin gehalten", count: 20 },
            { id: "sale", label: "Abschluss", count: 8 },
          ]}
        />
        <TrendChart
          caption="Punkte pro Monat, eigene Produktion, Jan–Okt 2026"
          data={[
            { label: "Jan", value: 12 },
            { label: "Feb", value: 18 },
            { label: "Mär", value: null },
            { label: "Apr", value: 25 },
            { label: "Mai", value: 22 },
            { label: "Jun", value: 31 },
          ]}
        />
        <PeriodSelector
          value={period}
          onChange={setPeriod}
          years={[2027, 2026, 2025]}
          careerPeriods={[
            {
              id: "p1",
              label: "1. Karrierejahr",
              start: "2026-11-01",
              end: "2027-11-01",
            },
          ]}
        />
        <p className="text-xs text-color-text-subtle">
          Abfragebereich:{" "}
          {range ? `[${range.start}, ${range.end})` : "ungültig"}
        </p>
      </Section>
    </main>
  );
};
