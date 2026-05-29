import { Suspense } from "react";
import { LoginPage } from "@/views/login/LoginPage";

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
