"use client";

import { useState } from "react";
import { Button } from "../../components/button/Button";
import { DataTable } from "../../components/dataTable/DataTable";
import { FileInput } from "../../components/fileInput/FileInput";
import { Form } from "../../components/form/Form";
import { TextArea } from "../../components/formFields/FormFields";
import { DownloadIcon } from "../../components/icons";
import { ModalActions } from "../../components/modal/ModalActions";
import { Notice } from "../../components/notice/Notice";
import { Select } from "../../components/select/Select";
import { useBanner } from "../../context/banner/BannerContext";
import { decodeCsvBytes, mapSuppressionCsv, parseCsv, SUPPRESSION_CSV_TEMPLATE, type SuppressionRow } from "../../domain/csvImport";
import { useEmailOps, type SuppressionImportResult } from "../../hooks/useEmail/useEmail";
import { downloadCsv } from "../../utils/csvExport";
import { dbErrorMessage, errorText } from "../../utils/dbErrors";
import { formatNumber } from "../../utils/format";
import { BLOCK_REASON_OPTIONS } from "./emailLabels";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 10_000;
const ROW_ERROR: Record<string, string> = {
  email_missing: "E-Mail-Adresse fehlt",
  invalid_email: "Keine gültige E-Mail-Adresse",
  suppression_reason_invalid: "Unbekannter Grund (erlaubt: Abmeldung, Unzustellbar, Beschwerde, Ungültig, Manuell)",
  duplicate_in_file: "Doppelt in der Datei",
};

/**
 * CSV import of existing opt-outs and bounces (P6-13, Gate E). The file is
 * read in the browser; the database validates every row and reports errors
 * by row number only, so no address ends up in a log.
 */
export const SuppressionImport = ({ onDone }: { onDone: () => void }) => {
  const { importSuppressions } = useEmailOps(true);
  const { showBanner } = useBanner();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("opt_out");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<SuppressionRow[] | null>(null);
  const [headerLines, setHeaderLines] = useState(0);
  const [problem, setProblem] = useState<string>();
  const [result, setResult] = useState<SuppressionImportResult | null>(null);

  const read = async (f: File | null) => {
    setFile(f);
    setRows(null);
    setResult(null);
    setProblem(undefined);
    if (!f) return;
    if (f.size > MAX_BYTES) return setProblem("Die Datei ist größer als 2 MB. Bitte teilen Sie sie auf.");
    const mapped = mapSuppressionCsv(parseCsv(decodeCsvBytes(await f.arrayBuffer())));
    if (mapped.missingEmailColumn) return setProblem("Keine Spalte „E-Mail“ gefunden. Laden Sie die Vorlage herunter, um das Format zu sehen.");
    if (mapped.rows.length === 0) return setProblem("Die Datei enthält keine Adressen.");
    if (mapped.rows.length > MAX_ROWS) return setProblem(`Die Datei hat ${formatNumber(mapped.rows.length)} Zeilen, höchstens ${formatNumber(MAX_ROWS)} sind möglich. Bitte teilen Sie sie auf.`);
    setRows(mapped.rows);
    setHeaderLines(mapped.headerLines);
  };

  const run = async () => {
    if (!rows) return;
    try {
      const r = await importSuppressions.mutateAsync({ rows, reason, note });
      setResult(r);
      showBanner("Sperrliste importiert", `${formatNumber(r.added)} neu gesperrt, ${formatNumber(r.already_blocked)} waren schon gesperrt, ${formatNumber(r.failed)} fehlerhaft.`, r.failed ? "warning" : "success");
    } catch (e) {
      setProblem(errorText(e, "Der Import ist fehlgeschlagen. Es wurde nichts gesperrt."));
    }
  };

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <strong>{formatNumber(result.added)}</strong> Adressen neu gesperrt · {formatNumber(result.already_blocked)} waren bereits gesperrt (unverändert) · {formatNumber(result.failed)} Zeilen fehlerhaft
        </p>
        {result.errors.length > 0 && (
          <DataTable caption="Fehlerhafte Zeilen" rows={result.errors} getRowId={(e) => String(e.row)}
            columns={[
              // The database counts data rows; people look for the line in Excel (P6-R2-01).
              { id: "row", header: "Zeile in der Datei", cell: (e) => e.row + headerLines, align: "right" },
              { id: "code", header: "Fehler", cell: (e) => ROW_ERROR[e.code] ?? dbErrorMessage({ message: e.code }) },
            ]} />
        )}
        <ModalActions><Button text="Fertig" onClick={onDone} /></ModalActions>
      </div>
    );
  }

  return (
    <Form onSubmit={run} className="flex flex-col gap-3">
      <p className="text-sm text-color-text-secondary">
        CSV mit einer Spalte „E-Mail“ und optional „Grund“ (Abmeldung, Unzustellbar, Beschwerde, Ungültig, Manuell), oder eine einfache Liste mit einer Adresse pro Zeile.
        Bereits gesperrte Adressen bleiben unverändert.
      </p>
      <div>
        <Button text="Vorlage herunterladen" variant="ghost" size="small" icon={DownloadIcon}
          onClick={() => downloadCsv(SUPPRESSION_CSV_TEMPLATE, "sperrliste-vorlage.csv")} />
      </div>
      <FileInput label="CSV-Datei" accept=".csv,text/csv,text/plain" file={file} onChange={read} isRequired error={problem} />
      <Select label="Grund, wenn in der Datei keiner steht" value={reason} onChange={setReason} options={BLOCK_REASON_OPTIONS} />
      <TextArea label="Notiz (optional, z. B. Herkunft der Liste)" value={note} onChange={setNote} rows={2} maxLength={500} />
      {rows && <Notice tone="info">{formatNumber(rows.length)} Zeilen gefunden. Die Prüfung jeder Adresse erfolgt beim Import.</Notice>}
      <ModalActions>
        <Button text="Abbrechen" variant="ghost" onClick={onDone} />
        <Button type="submit" text={rows ? `${formatNumber(rows.length)} Adressen sperren` : "Importieren"} isDisabled={!rows} />
      </ModalActions>
    </Form>
  );
};
