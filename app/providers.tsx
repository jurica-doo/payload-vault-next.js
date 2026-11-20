"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { isRetryableError } from "@/utils/dbErrors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { YearProvider } from "@/context/YearContext";
import { BannerProvider } from "@/context/banner/BannerProvider";
import { ModalProvider } from "@/context/modal/ModalProvider";
import { ScrollToTop } from "@/components/scrollToTop/ScrollToTop";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { PwaUpdateBar } from "@/components/pwa/PwaUpdateBar";
import { NavigationProgress } from "@/components/navigationProgress/NavigationProgress";
import { setupCookieConsent } from "@/cookieconsent-config";
import {
  applyTheme,
  getThemePreference,
  watchSystemTheme,
} from "@/utils/theme";

export function Providers({ children }: { children: ReactNode }) {
  // Retry only what can succeed on a second try (network, timeouts); a refusal
  // or validation error is shown at once instead of after ~7 s of retries.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: (count, error) => count < 2 && isRetryableError(error) } },
      }),
  );

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
              {/* useSearchParams needs a Suspense boundary for static pages. */}
              <Suspense fallback={null}>
                <NavigationProgress />
              </Suspense>
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
