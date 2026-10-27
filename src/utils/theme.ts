/**
 * Theme preference: "system" follows the OS, "light"/"dark" pin it. The
 * resolved value always lands on <html data-theme>, which is what the CSS
 * tokens read. The inline script in app/layout.tsx does the same resolution
 * before first paint; keep the two in sync.
 */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";
const EVENT = "themechange";

export const getThemePreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage blocked (private mode): fall back to the OS setting.
  }
  return "system";
};

const systemTheme = (): ResolvedTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const resolveTheme = (pref: ThemePreference): ResolvedTheme =>
  pref === "system" ? systemTheme() : pref;

export const applyTheme = (pref: ThemePreference) => {
  document.documentElement.dataset.theme = resolveTheme(pref);
};

export const setThemePreference = (pref: ThemePreference) => {
  try {
    if (pref === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Ignore: the choice still applies for this page view.
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pref }));
};

/** Re-applies the theme when the OS switches while on "system". */
export const watchSystemTheme = () => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemePreference() === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

export const onThemePreferenceChange = (
  cb: (pref: ThemePreference) => void,
) => {
  const handler = (e: Event) => cb((e as CustomEvent<ThemePreference>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};
