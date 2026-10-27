"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { InputField } from "../../components/inputField/InputField";
import { DataTable } from "../../components/dataTable/DataTable";
import { MfaRequiredNotice } from "../../components/mfa/MfaRequiredNotice";
import { RoleGate } from "../../components/roleGate/RoleGate";
import { EmptyState } from "../../components/emptyState/EmptyState";
import { useBanner } from "../../context/banner/BannerContext";
import { usePermissions } from "../../hooks/permissions/usePermissions";
import { useProductionImport, type ImportRowInput } from "../../hooks/useProduction/useProduction";
import { mapProductionCsv, parseCsv, REQUIRED_FIELDS } from "../../domain/csvImport";
import { dbErrorMessage, errorText } from "../../utils/dbErrors";

const MAX_BYTES = 2 * 1024 * 1024;

const IMPORT_ERRORS: Record<string, string> = {
  source_id_required: "Quelle-ID fehlt",
  duplicate_in_file: "Quelle-ID doppelt in der Datei",
  already_imported: "Bereits importiert",
  unknown_employee_no: "Personalnummer unbekannt",
  invalid_value: "Ungültiger Wert (Zahl oder Datum)",
};
const rowError = (key: string) => IMPORT_ERRORS[key] ?? dbErrorMessage({ message: key });

type StagedRow = { row_number: number; raw: ImportRowInput; errors: string[] };

/**
 * Two-step import: everything is validated in the database first (each row
 * gets its own error list), then only valid rows are taken over as
 * "submitted". Nothing is written to production records before step 2.
 */
export const ProductionImportPage = () => {
  const { permissions } = usePermissions();
  const { showBanner } = useBanner();
  const { stage, commit } = useProductionImport();
  const [sourceSystem, setSourceSystem] = useState("Partnerportal");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string>();
  const [staged, setStaged] = useState<{ batchId: string; rows: StagedRow[] } | null>(null);
  const canWrite = permissions.isAdmin && permissions.hasMfa;

  const check = async () => {
    setProblem(undefined);
    setStaged(null);
    if (!file) return setProblem("Bitte eine CSV-Datei wählen.");
    if (file.size > MAX_BYTES) return setProblem("Die Datei ist größer als 2 MB.");
    const mapped = mapProductionCsv(parseCsv(await file.text()));
    if (mapped.missingColumns.length) {
      return setProblem(`Pflichtspalten fehlen: ${mapped.missingColumns.join(", ")}. Erwartet: ${REQUIRED_FIELDS.join(", ")}.`);
    }
    if (mapped.rows.length === 0) return setProblem("Die Datei enthält keine Datenzeilen.");
    try {
      const result = await stage.mutateAsync({ sourceSystem, fileName: file.name, rows: mapped.rows });
      setStaged(result as { batchId: string; rows: StagedRow[] });
    } catch (e) {
      setProblem(errorText(e));
    }
  };

  const valid = staged?.rows.filter((r) => r.errors.length === 0).length ?? 0;

  return (
    <RoleGate when={permissions.isAdmin} fallback={<EmptyState message="Nur für die Verwaltung." />}>
      <div className="flex flex-col gap-4">
        {!permissions.hasMfa && <MfaRequiredNotice />}

        <section className="flex flex-col gap-3 ui-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">1. Datei prüfen</h2>
          <p className="text-sm">
            Spalten (deutsche Überschriften genügen): Quelle-ID, Pers.-Nr., Sparte, Beitrag, Rhythmus, Datum; optional Netto/Brutto, Laufzeit, Referenz.
            Zahlen im deutschen Format (1.234,56), Datum als TT.MM.JJJJ.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField label="Quellsystem" placeholder="Partnerportal" value={sourceSystem} onChange={setSourceSystem} isRequired />
            <label className="flex flex-col gap-1 text-[14px] font-semibold text-color-text-secondary">
              CSV-Datei
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="ui-input"
              />
            </label>
          </div>
          {problem && <p role="alert" className="text-sm text-color-error-text">{problem}</p>}
          <div>
            <Button text="Prüfen" onClick={check} isLoading={stage.isPending} isDisabled={!canWrite} />
          </div>
        </section>

        {staged && (
          <section className="flex flex-col gap-3 ui-card p-4 sm:p-5">
            <h2 className="text-base font-semibold">2. Ergebnis</h2>
            <p className="text-sm">
              {staged.rows.length} Zeilen, davon <span className="font-semibold text-color-success-text">{valid} gültig</span>
              {staged.rows.length - valid > 0 && (
                <> und <span className="font-semibold text-color-error-text">{staged.rows.length - valid} mit Fehlern</span> (werden nicht übernommen)</>
              )}.
            </p>
            <DataTable
              rows={staged.rows}
              getRowId={(r) => String(r.row_number)}
              caption="Importzeilen"
              columns={[
                { id: "n", header: "Zeile", cell: (r) => r.row_number + 1, sortValue: (r) => r.row_number },
                { id: "src", header: "Quelle-ID", cell: (r) => r.raw.source_id || "–" },
                { id: "emp", header: "Pers.-Nr.", cell: (r) => r.raw.employee_no || "–" },
                { id: "cat", header: "Sparte", cell: (r) => r.raw.category },
                { id: "prem", header: "Beitrag", cell: (r) => r.raw.premium, hideOnMobile: true },
                {
                  id: "err",
                  header: "Prüfung",
                  cell: (r) =>
                    r.errors.length === 0 ? (
                      <span className="text-color-success-text">OK</span>
                    ) : (
                      <span className="text-color-error-text">{r.errors.map(rowError).join("; ")}</span>
                    ),
                  sortValue: (r) => r.errors.length,
                },
              ]}
            />
            <div>
              <Button
                text={`${valid} gültige Zeilen übernehmen`}
                isDisabled={!canWrite || valid === 0}
                isLoading={commit.isPending}
                onClick={async () => {
                  try {
                    const n = await commit.mutateAsync(staged.batchId);
                    showBanner("Import abgeschlossen", `${n} Einträge als „eingereicht“ übernommen.`, "success");
                    setStaged(null);
                    setFile(null);
                  } catch (e) {
                    showBanner("Import fehlgeschlagen", errorText(e), "error");
                  }
                }}
              />
            </div>
          </section>
        )}
      </div>
    </RoleGate>
  );
};
