"use client";

import { useState, useEffect } from "react";
import { useChangePasswordModal } from "../../hooks/modal/UsePasswordChangeModal";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { LockIcon, LogoutIcon, MoonIcon, SunIcon } from "../icons";
import { useBanner } from "../../context/banner/BannerContext";
import { useLogoutModal } from "../../hooks/modal/UseLogoutModal";

type MenuDropdownProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

export const MenuDropdown = ({
  isOpen,
  setIsOpen,
  theme,
  toggleTheme,
}: MenuDropdownProps) => {
  const router = useRouter();
  const { showBanner } = useBanner();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsAnimatingOut(false);
    } else if (isVisible) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsAnimatingOut(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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
      throw new Error("An error occurred while changing the password.");
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
      className={`
              absolute right-0 top-full mt-2
              w-48 md:min-w-55
              rounded-radius-md
              border border-color-border-light
              bg-color-bg-dark
              shadow-lg
              z-50
              overflow-hidden
              ${isAnimatingOut ? "animate-slide-up-out" : "animate-slide-down"}
            `}
    >
      <button
        role="menuitem"
        className="w-full px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm text-left hover:bg-color-primary/20 cursor-pointer flex items-center gap-2
        hover:text-color-text-main text-color-text-subtle transition-all duration-200 ease-in-out active:bg-color-primary/30"
        onClick={() => {
          openChangePasswordModal();
          setIsOpen(false);
        }}
      >
        <LockIcon className="w-4 h-4" />
        Passwort ändern
      </button>

      <button
        role="menuitem"
        className="w-full px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm text-left hover:bg-color-primary/20 cursor-pointer flex items-center gap-2
        hover:text-color-text-main text-color-text-subtle transition-all duration-200 ease-in-out active:bg-color-primary/30"
        onClick={() => {
          toggleTheme();
          setIsOpen(false);
        }}
      >
        {theme === "dark" ? (
          <SunIcon className="w-4 h-4" />
        ) : (
          <MoonIcon className="w-4 h-4" />
        )}
        {theme === "dark" ? "Hellmodus" : "Dunkelmodus"}
      </button>

      <button
        role="menuitem"
        className="w-full px-3 py-2.5 md:px-4 md:py-3 text-xs md:text-sm text-left hover:bg-color-primary/20 cursor-pointer flex items-center gap-2 text-color-error-text/75
        hover:text-color-error-text transition-all duration-200 ease-in-out active:bg-color-error/20"
        onClick={() => {
          setIsOpen(false);
          openLogoutModal();
        }}
      >
        <LogoutIcon className="w-4 h-4" />
        Abmelden
      </button>
    </div>
  );
};
