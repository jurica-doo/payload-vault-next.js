/**
 * Shared class strings for places that need a plain element (a <section>,
 * a <form>) styled as a card or control. Prefer <Card>/<SectionCard> for new
 * markup; these keep older views consistent without restructuring them.
 */

/** Standard content card with vertical rhythm. */
export const cardClass = "ui-card flex flex-col gap-3 p-4 sm:p-5 animate-fade-in";

/** Native <input>/<select> matching InputField/Dropdown. */
export const inputClass = "ui-input";

/** Compact text action for table rows and card headers. */
export const rowActionClass =
  "ui-link-button text-xs! disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
