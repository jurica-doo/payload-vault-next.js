"use client";

import { useState, useEffect, type ComponentType } from "react";
import { useChangePasswordModal } from "../../hooks/modal/UsePasswordChangeModal";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  KeyIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
} from "../icons";
import type { IconProps } from "../icons/Icon.types";
import {
  getThemePreference,
  onThemePreferenceChange,
  setThemePreference,
  type ThemePreference,
} from "../../utils/theme";
import { useBanner } from "../../context/banner/BannerContext";
import { useLogoutModal } from "../../hooks/modal/UseLogoutModal";

type MenuDropdownProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  email?: string;
};

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: ComponentType<IconProps>;
}[] = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Hell", icon: SunIcon },
  { value: "dark", label: "Dunkel", icon: MoonIcon },
];

const itemClass =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-radius-md px-2.5 py-2 text-left text-sm text-color-text-main transition-colors duration-100 hover:bg-color-bg-hover focus:bg-color-bg-hover focus:outline-none";

export const MenuDropdown = ({
  isOpen,
  setIsOpen,
  email,
}: MenuDropdownProps) => {
  const [themePref, setThemePref] = useState<ThemePreference>("system");

  useEffect(() => {
    // Read after mount: localStorage isn't available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemePref(getThemePreference());
    return onThemePreferenceChange(setThemePref);
  }, []);
  const router = useRouter();
  const { showBanner } = useBanner();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Open/close transitions via render adjustment; only the exit timer
  // (an actual external system) lives in an effect.
  if (isOpen && (!isVisible || isAnimatingOut)) {
    setIsVisible(true);
    setIsAnimatingOut(false);
  } else if (!isOpen && isVisible && !isAnimatingOut) {
    setIsAnimatingOut(true);
  }

  useEffect(() => {
    if (!isAnimatingOut) return;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setIsAnimatingOut(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [isAnimatingOut]);

  const handleChangePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      if (
        error.message.toLowerCase().includes("same") ||
        error.message.toLowerCase().includes("different")
      ) {
        throw new Error(
          "Das neue Passwort darf nicht mit Ihrem aktuellen Passwort identisch sein.",
        );
      }
      throw new Error(
        "Das Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.",
      );
    }

    showBanner(
      "Passwort geändert",
      "Ihr Passwort wurde erfolgreich geändert.",
      "success",
    );
    closeModal();
  };

  const { openChangePasswordModal, closeModal } = useChangePasswordModal({
    onSave: handleChangePassword,
  });

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setIsOpen(false);
      router.push("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    }

    closeLogoutModal();
  };

  const { openLogoutModal, closeModal: closeLogoutModal } = useLogoutModal({
    onSave: handleLogout,
  });

  if (!isVisible) return null;

  return (
    <div
      role="menu"
      aria-label="Benutzermenü"
      className={`absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-radius-lg bg-color-surface-raised p-1.5 shadow-shadow-strong ring-1 ring-color-border-light ${
        isAnimatingOut ? "animate-slide-up-out" : "animate-slide-down"
      }`}
    >
      {email && (
        <div className="mb-1 border-b border-color-border-light px-2.5 pb-2.5 pt-1.5">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-color-text-subtle">
            Angemeldet als
          </p>
          <p className="truncate text-sm font-medium text-color-text-main">
            {email}
          </p>
        </div>
      )}

      <button
        role="menuitem"
        type="button"
        className={itemClass}
        onClick={() => {
          setIsOpen(false);
          router.push("/profil/sicherheit");
        }}
      >
        <ShieldIcon size={16} className="text-color-icon" />
        Sicherheit &amp; Zwei-Faktor
      </button>

      <button
        role="menuitem"
        type="button"
        className={itemClass}
        onClick={() => {
          openChangePasswordModal();
          setIsOpen(false);
        }}
      >
        <KeyIcon size={16} className="text-color-icon" />
        Passwort ändern
      </button>

      <div className="my-1 border-t border-color-border-light px-2.5 pb-1 pt-2.5">
        <p
          id="theme-label"
          className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-color-text-subtle"
        >
          Darstellung
        </p>
        <div
          role="radiogroup"
          aria-labelledby="theme-label"
          className="grid grid-cols-3 gap-0.5 rounded-radius-md bg-color-bg-alt p-0.5 ring-1 ring-inset ring-color-border-light"
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = themePref === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setThemePreference(value)}
                className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] text-xs font-medium transition-all duration-150 active:scale-95 ${
                  active
                    ? "bg-color-bg-card text-color-text-main shadow-shadow-soft"
                    : "text-color-text-subtle hover:text-color-text-main"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-color-border-light pt-1">
        <button
          role="menuitem"
          type="button"
          className={`${itemClass} text-color-error-text! hover:bg-color-bg-error-subtle focus:bg-color-bg-error-subtle`}
          onClick={() => {
            setIsOpen(false);
            openLogoutModal();
          }}
        >
          <LogOutIcon size={16} />
          Abmelden
        </button>
      </div>
    </div>
  );
};
