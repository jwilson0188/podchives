import { PageHeader } from "@/components/ui/PageHeader";
import { UsageLiveBody } from "@/components/usage/UsageLiveBody";
import { getDataMode, getUsagePayload } from "@/lib/data";

export const metadata = { title: "Usage / Compute" };

export default async function UsagePage() {
  const payload = await getUsagePayload();
  const isDemo = getDataMode() === "demo";

  return (
    <div>
      <PageHeader
        title="Usage / Compute"
        description={`Transcription, embeddings, and storage to date · compute budget for ${payload.usage.monthLabel}.`}
      />

      <UsageLiveBody initial={payload} isDemo={isDemo} />
    </div>
  );
}
