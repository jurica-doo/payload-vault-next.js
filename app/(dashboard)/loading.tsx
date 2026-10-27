import { PageSkeletonLoader } from "@/components/skeletonLoader/PageSkeletonLoader";

// Shown inside the shell while the next page loads, so the navigation stays put.
export default function Loading() {
  return <PageSkeletonLoader />;
}
