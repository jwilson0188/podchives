import { DownloadManagerLiveBody } from "@/components/processing/DownloadManagerLiveBody";
import { getDownloadManagerSnapshot } from "@/lib/data";
export const metadata = { title: "Download Manager" };
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function DownloadManagerPage() {
  return <DownloadManagerLiveBody initial={await getDownloadManagerSnapshot()} />;
}
