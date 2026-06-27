import { PageHeader } from "@/components/ui/PageHeader";
import { UsageLiveBody } from "@/components/usage/UsageLiveBody";
import { getDataMode, getUsageStats } from "@/lib/data";

export const metadata = { title: "Usage / Compute" };

export const revalidate = 300;

export default async function UsagePage() {
  const usage = await getUsageStats();
  const isDemo = getDataMode() === "demo";

  return (
    <div>
      <PageHeader
        eyebrow="ops // usage"
        title="Usage / Compute"
        description={`Transcription, embeddings, and storage to date · compute budget for ${usage.monthLabel}.`}
      />

      <UsageLiveBody initial={usage} isDemo={isDemo} />
    </div>
  );
}
