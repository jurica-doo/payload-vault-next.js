export type DuplicateItem = {
  key: string;
  /** Link and label only for records the viewer may see; others stay anonymous. */
  href?: string;
  label?: string;
  reason: "phone" | "email" | "name";
  owner: string | null;
};

const REASON_LABEL = { phone: "gleiche Telefonnummer", email: "gleiche E-Mail", name: "ähnlicher Name" } as const;

/**
 * Duplicate warning before creating a lead or customer (§9.5): matches are
 * listed, nothing is merged, and saving needs an explicit confirmation.
 */
export const DuplicateWarning = ({
  items,
  confirmed,
  onConfirmedChange,
  hiddenLabel = "Eintrag einer anderen Person",
}: {
  items: DuplicateItem[];
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  hiddenLabel?: string;
}) => (
  <div role="alert" className="flex flex-col gap-2 rounded-radius-md border border-color-secondary/50 bg-color-bg-dark p-3 text-sm">
    <p className="font-semibold">Mögliche Duplikate gefunden</p>
    <ul className="flex flex-col gap-1">
      {items.map((d) => (
        <li key={d.key}>
          {d.href ? (
            <a href={d.href} target="_blank" rel="noreferrer" className="font-semibold">{d.label}</a>
          ) : (
            <span className="font-semibold">{hiddenLabel}</span>
          )}
          <span className="text-color-text-subtle"> · {REASON_LABEL[d.reason]}{d.owner ? ` · zuständig: ${d.owner}` : " · nicht zugewiesen"}</span>
        </li>
      ))}
    </ul>
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={confirmed} onChange={(e) => onConfirmedChange(e.target.checked)} />
      Geprüft: Das ist eine andere Person, trotzdem anlegen.
    </label>
  </div>
);
