"use client";

import Link from "next/link";
import { useState } from "react";
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
  const { data = [], markRead, mute } = useNotifications(true);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const unread = data.filter((n) => !n.read_at).length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Benachrichtigungen${unread ? ` (${unread} ungelesen)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative cursor-pointer rounded-radius-md p-2 text-color-text-secondary hover:bg-color-primary/20"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-color-error-border px-1 text-center text-xs font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Benachrichtigungen" className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-radius-md border border-color-border-light bg-color-bg-dark p-3 shadow-shadow-medium">
          <div className="mb-2 flex items-center justify-between text-xs">
            <button type="button" className="cursor-pointer font-semibold text-color-text-accent" onClick={() => markRead.mutate(null)} disabled={!unread}>
              Alle gelesen
            </button>
            <button type="button" className="cursor-pointer text-color-text-subtle" onClick={() => setSettings((s) => !s)}>
              Einstellungen
            </button>
          </div>
          {settings ? (
            <form className="flex flex-col gap-1 text-sm" onSubmit={(e) => { e.preventDefault(); mute.mutate(muted); setSettings(false); }}>
              <p className="text-xs text-color-text-subtle">Stummschalten (Freigaben und Prüffälle bleiben immer sichtbar):</p>
              {MUTABLE.map((m) => (
                <label key={m.kind} className="flex items-center gap-2">
                  <input type="checkbox" checked={muted.includes(m.kind)}
                    onChange={(e) => setMuted((x) => (e.target.checked ? [...x, m.kind] : x.filter((k) => k !== m.kind)))} />
                  {m.label}
                </label>
              ))}
              <button type="submit" className="mt-1 cursor-pointer self-start text-xs font-semibold text-color-text-accent">Speichern</button>
            </form>
          ) : data.length === 0 ? (
            <p className="text-sm text-color-text-subtle">Keine Benachrichtigungen.</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto text-sm">
              {data.map((n) => (
                <li key={n.id} className={n.read_at ? "opacity-60" : ""}>
                  {n.critical && <span className="mr-1 text-xs font-bold text-color-secondary">!</span>}
                  {n.link ? (
                    <Link href={n.link} onClick={() => { markRead.mutate([n.id]); setOpen(false); }} className="font-semibold">{n.title}</Link>
                  ) : (
                    <span className="font-semibold">{n.title}</span>
                  )}
                  {n.body && <span className="block text-xs text-color-text-secondary">{n.body}</span>}
                  <span className="block text-xs text-color-text-subtle">{formatDateTime(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
