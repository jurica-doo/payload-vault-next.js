"use client";

import { useErrorToast } from "../../hooks/useErrorToast";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellIcon, SettingsIcon } from "../icons";
import { useNotifications } from "../../hooks/useTasks/useTasks";
import { formatDateTime } from "../../utils/format";

const MUTABLE = [
  { kind: "manual", label: "Zugewiesene Aufgaben" },
  { kind: "coaching_action", label: "Überfällige Maßnahmen" },
  { kind: "coaching_review", label: "Coaching-Termine" },
  { kind: "career_period_end", label: "Karrierezeitraum endet" },
  { kind: "lead_first_contact", label: "Lead-Erstkontakt" },
  { kind: "lead_next_action", label: "Lead: nächster Schritt" },
  { kind: "lead_assigned", label: "Zugewiesene Leads" },
  { kind: "lead_sla_breach", label: "Überfällige Erstkontakte im Team" },
  { kind: "customer_assigned", label: "Übernommene Kunden" },
  { kind: "customer_service", label: "Kundenservice-Termine" },
  { kind: "customer_follow_up", label: "Kunden nachfassen" },
];

/**
 * In-app notifications (§11.3). Critical ones (approvals, calculation
 * exceptions, reassignments) can't be muted; the database ignores attempts.
 */
export const NotificationBell = () => {
  const onFail = useErrorToast();
  const { data = [], markRead, mute } = useNotifications(true);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const unread = data.filter((n) => !n.read_at).length;
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        aria-label={`Benachrichtigungen${unread ? ` (${unread} ungelesen)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-radius-md text-color-text-secondary transition-all duration-150 hover:bg-color-bg-hover hover:text-color-text-main active:scale-90 ${
          open ? "bg-color-bg-hover text-color-text-main" : ""
        }`}
      >
        <BellIcon size={19} className={unread > 0 ? "origin-top animate-[bellRing_0.9s_ease-in-out_1]" : ""} />
        {unread > 0 && (
          <span className="tabular absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-color-error-border px-1 text-[0.625rem] font-semibold leading-none text-white ring-2 ring-color-bg-main animate-pop-in">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Benachrichtigungen" className="absolute right-0 top-full z-50 mt-2 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-radius-lg bg-color-surface-raised shadow-shadow-strong ring-1 ring-color-border-light animate-slide-down max-sm:-right-24">
          <div className="flex items-center justify-between gap-2 border-b border-color-border-light px-4 py-3">
            <p className="text-sm font-semibold text-color-text-main">
              Benachrichtigungen
            </p>
            <div className="flex items-center gap-1">
              <button type="button" className="ui-link-button text-xs! disabled:cursor-not-allowed disabled:opacity-40" onClick={() => markRead.mutate(null, { onError: onFail("Nicht als gelesen markiert") })} disabled={!unread}>
                Alle gelesen
              </button>
              <button
                type="button"
                aria-label="Benachrichtigungs-Einstellungen"
                aria-pressed={settings}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-radius-sm text-color-text-subtle transition-all hover:bg-color-bg-hover hover:text-color-text-main ${settings ? "bg-color-bg-hover text-color-text-main" : ""}`}
                onClick={() => setSettings((s) => !s)}
              >
                <SettingsIcon size={15} />
              </button>
            </div>
          </div>
          {settings ? (
            <form className="flex flex-col gap-2 p-4 text-sm animate-fade-in" onSubmit={(e) => { e.preventDefault(); mute.mutate(muted, { onError: onFail("Einstellungen nicht gespeichert") }); setSettings(false); }}>
              <p className="text-xs text-color-text-subtle">Stummschalten (Freigaben und Prüffälle bleiben immer sichtbar):</p>
              {MUTABLE.map((m) => (
                <label key={m.kind} className="flex cursor-pointer items-center gap-2.5 text-color-text-main">
                  <input type="checkbox" checked={muted.includes(m.kind)}
                    onChange={(e) => setMuted((x) => (e.target.checked ? [...x, m.kind] : x.filter((k) => k !== m.kind)))} />
                  {m.label}
                </label>
              ))}
              <button type="submit" className="mt-1 inline-flex h-8 cursor-pointer items-center self-start rounded-radius-md bg-color-primary px-3 text-xs font-medium text-color-on-primary transition-all hover:bg-color-primary-dark active:scale-95">Speichern</button>
            </form>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-color-bg-alt text-color-text-subtle">
                <BellIcon size={18} />
              </span>
              <p className="text-sm text-color-text-subtle">Keine Benachrichtigungen.</p>
            </div>
          ) : (
            <ul className="flex max-h-[24rem] flex-col overflow-y-auto p-1.5 text-sm">
              {data.map((n) => (
                <li key={n.id} className={`relative rounded-radius-md px-3 py-2.5 transition-colors hover:bg-color-bg-hover ${n.read_at ? "opacity-60" : ""}`}>
                  {!n.read_at && <span aria-hidden className="absolute left-1 top-4 h-1.5 w-1.5 rounded-full bg-color-primary" />}
                  {n.critical && <span className="mr-1.5 rounded-sm bg-color-bg-warning-subtle px-1 text-[0.625rem] font-semibold uppercase text-color-warning-text">Wichtig</span>}
                  {n.link ? (
                    <Link href={n.link} onClick={() => { markRead.mutate([n.id]); setOpen(false); }} className="font-medium text-color-text-main no-underline hover:text-color-text-accent">{n.title}</Link>
                  ) : (
                    <span className="font-medium text-color-text-main">{n.title}</span>
                  )}
                  {n.body && <span className="mt-0.5 block text-xs text-color-text-secondary">{n.body}</span>}
                  <span className="mt-0.5 block text-[0.6875rem] text-color-text-subtle">{formatDateTime(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
