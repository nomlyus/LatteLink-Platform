import { notFound } from "next/navigation";

export default async function OnboardingPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { OnboardingPreview } = await import("../../../features/onboarding/components/OnboardingPreview");
  return <OnboardingPreview />;
}
