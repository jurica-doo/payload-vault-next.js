import { Suspense } from "react";
import { LeadsPage } from "@/views/leads/LeadsPage";

export default function Page() {
  return (
    <Suspense>
      <LeadsPage />
    </Suspense>
  );
}
