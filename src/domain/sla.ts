/**
 * Business-hours arithmetic for lead SLAs (§9.3). Mirrors
 * app_private.add_business_hours: counts only configured workdays, between
 * workday start and end in Berlin wall time, skipping holidays. The database
 * value is authoritative; this powers previews ("Erstkontakt bis …").
 */
import { berlinLocalToUtcIso } from "../utils/format";

export type SlaCalendar = {
  workdayStart: string; // "09:00"
  workdayEnd: string; // "17:00"
  workdays: number[]; // ISO weekday, 1 = Monday
  holidays: ReadonlySet<string>; // "YYYY-MM-DD"
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Berlin wall time of an instant, as a "naive" UTC millisecond value. */
function berlinWall(iso: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  const ms = new Date(iso).getUTCMilliseconds();
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second, ms);
}

/** Naive wall time back to a real instant (DST-correct). */
function fromWall(wall: number): string {
  const d = new Date(wall);
  const date = d.toISOString().slice(0, 10);
  const hhmm = d.toISOString().slice(11, 16);
  const rest = wall % MINUTE; // seconds + ms
  return new Date(Date.parse(berlinLocalToUtcIso(date, hhmm)) + rest).toISOString();
}

export function addBusinessHours(startIso: string, hours: number, cal: SlaCalendar): string {
  if (!(hours >= 0)) throw new Error("hours must be ≥ 0");
  const open = toMinutes(cal.workdayStart) * MINUTE;
  const close = toMinutes(cal.workdayEnd) * MINUTE;
  let left = Math.round(hours * 60 * MINUTE);
  let wall = berlinWall(startIso);

  for (let i = 0; i < 800; i++) {
    const dayStart = wall - (((wall % DAY) + DAY) % DAY);
    const date = new Date(dayStart).toISOString().slice(0, 10);
    const isoDow = ((new Date(dayStart).getUTCDay() + 6) % 7) + 1;
    if (cal.workdays.includes(isoDow) && !cal.holidays.has(date)) {
      if (wall < dayStart + open) wall = dayStart + open;
      if (wall < dayStart + close) {
        const available = dayStart + close - wall;
        if (left <= available) return fromWall(wall + left);
        left -= available;
      }
    }
    wall = dayStart + DAY + open;
  }
  throw new Error("calendar exhausted");
}
