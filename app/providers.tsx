"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { YearProvider } from "@/context/YearContext";
import { BannerProvider } from "@/context/banner/BannerProvider";
import { ModalProvider } from "@/context/modal/ModalProvider";
import { ScrollToTop } from "@/components/scrollToTop/ScrollToTop";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { PwaUpdateBar } from "@/components/pwa/PwaUpdateBar";
import { setupCookieConsent } from "@/cookieconsent-config";
import {
  applyTheme,
  getThemePreference,
  watchSystemTheme,
} from "@/utils/theme";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    applyTheme(getThemePreference());
    return watchSystemTheme();
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
              <PwaUpdateBar />
              {children}
            </ModalProvider>
          </BannerProvider>
        </YearProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
