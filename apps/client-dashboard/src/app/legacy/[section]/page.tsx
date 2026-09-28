import { notFound } from "next/navigation";
import { ClientDashboardRoot } from "../../ClientDashboardRoot";
import { isLegacyDashboardSection } from "../../../lib/navigation/dashboard-navigation";

export default async function LegacyDashboardSectionPage({
  params
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isLegacyDashboardSection(section)) notFound();
  return <ClientDashboardRoot initialSection={section} />;
}
