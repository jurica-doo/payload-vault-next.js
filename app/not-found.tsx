import { redirect } from "next/navigation";

// Mirrors the old react-router catch-all: <Route path="*" -> Navigate to "/" />
export default function NotFound() {
  redirect("/");
}
