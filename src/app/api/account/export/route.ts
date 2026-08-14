import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { exportConsumerData } from "@/server/account/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const data = await exportConsumerData(consumerProfileId);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="my-rvmatch-data.json"',
    },
  });
}
