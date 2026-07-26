"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "../components/loadingScreen/LoadingScreen";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    // Redirecting to /login — keep the loading screen up instead of flashing
    // an empty page.
    return <LoadingScreen />;
  }

  return <>{children}</>;
};
