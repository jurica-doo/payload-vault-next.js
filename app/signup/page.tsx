import { Suspense } from "react";
import { SignUpPage } from "@/views/signup/SignupPage";

export default function Page() {
  return (
    <Suspense>
      <SignUpPage />
    </Suspense>
  );
}
