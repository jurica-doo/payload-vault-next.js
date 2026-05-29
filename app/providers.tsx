"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { YearProvider } from "@/context/YearContext";
import { BannerProvider } from "@/context/banner/BannerProvider";
import { ModalProvider } from "@/context/modal/ModalProvider";
import { ScrollToTop } from "@/components/scrollToTop/ScrollToTop";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { PwaUpdateToast } from "@/components/pwa/PwaUpdateToast";
import { setupCookieConsent } from "@/cookieconsent-config";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const theme = saved ?? (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  }, []);

  useEffect(() => {
    setupCookieConsent();
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <YearProvider>
          <BannerProvider>
            <ModalProvider>
              <ScrollToTop />
              <PwaInstallPrompt />
              <PwaUpdateToast />
              {children}
            </ModalProvider>
          </BannerProvider>
        </YearProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
