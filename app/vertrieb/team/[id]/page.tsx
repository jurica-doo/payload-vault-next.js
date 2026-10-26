import { ProfilePage } from "@/views/team/ProfilePage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfilePage employeeId={id} />;
}
