"use client";

import { type DragEvent, useId, useRef, useState } from "react";
import { FileTextIcon, UploadIcon, XIcon } from "../icons";

type FileInputProps = {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Same format as the native attribute, e.g. ".csv,text/csv". */
  accept?: string;
  isRequired?: boolean;
  error?: string;
};

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("de-DE")} KB`
    : `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;

/** Loose check of a dropped file against `accept` (extensions and MIME types). */
const accepts = (file: File, accept?: string) =>
  !accept ||
  accept.split(",").some((rule) => {
    const r = rule.trim().toLowerCase();
    return r.startsWith(".") ? file.name.toLowerCase().endsWith(r) : file.type === r;
  });

/**
 * File field in the app's language and look. The browser's own file input
 * shows "Choose File / No file chosen" in the browser's language, so the
 * native input stays hidden (but focusable) behind a German button and the
 * chosen file's name. Same height and label as InputField; files can also be
 * dropped onto the field.
 */
export const FileInput = ({ label, file, onChange, accept, isRequired, error }: FileInputProps) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const clear = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && accepts(dropped, accept)) onChange(dropped);
  };

  return (
    <div className="flex w-full flex-col">
      <label
        htmlFor={id}
        className="mb-1.5 flex cursor-pointer items-center gap-0.5 text-[0.8125rem] font-medium text-color-text-secondary"
      >
        <span>{label}</span>
        {isRequired && (
          <span aria-hidden className="text-color-error-text">
            *
          </span>
        )}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-11 items-center gap-3 rounded-radius-md border bg-color-bg-card py-1.5 pl-1.5 pr-2 transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-color-primary focus-within:shadow-[0_0_0_3px_var(--color-focus-ring)] ${
          error ? "border-color-error-border" : dragging ? "border-color-primary bg-color-bg-accent-subtle" : "border-color-border-strong"
        }`}
      >
        <label
          htmlFor={id}
          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-radius-sm border border-color-border-strong bg-color-bg-alt px-3 text-sm font-medium text-color-text-main transition-[background-color,scale] duration-150 hover:bg-color-bg-hover active:scale-[0.97]"
        >
          <UploadIcon size={16} className="h-4 w-4" />
          {file ? "Andere Datei" : "Datei auswählen"}
        </label>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          // Not `required`: the browser would point its bubble at a hidden input.
          aria-required={isRequired || undefined}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {file ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <FileTextIcon size={16} className="shrink-0 text-color-text-subtle" />
            <span className="truncate text-color-text-main" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 text-xs text-color-text-subtle tabular-nums">{formatSize(file.size)}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-color-text-subtle">
            {dragging ? "Datei hier ablegen" : "Keine Datei ausgewählt"}
          </span>
        )}
        {file && (
          <button
            type="button"
            onClick={clear}
            aria-label="Datei entfernen"
            title="Datei entfernen"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-radius-sm text-color-text-subtle transition-colors hover:bg-color-bg-hover hover:text-color-text-main"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-[0.8125rem] text-color-error-text">{error}</p>}
    </div>
  );
};
