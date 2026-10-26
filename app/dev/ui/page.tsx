import { notFound } from "next/navigation";
import { DevUiPage } from "@/views/devUi/DevUiPage";

/**
 * Component showcase for the r1 UI kit. Development only: production builds
 * answer 404, so it never ships as a reachable page.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevUiPage />;
}
