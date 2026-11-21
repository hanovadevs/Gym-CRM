import { getBilling } from "@/modules/billing";
import { invoicePdf } from "@/modules/billing/pdf";
import { failure } from "@/server/http";
export const runtime = "nodejs";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const data = await getBilling().download(
      r.headers,
      (await c.params).id,
      Object.fromEntries(new URL(r.url).searchParams),
    );
    const bytes = await invoicePdf(data),
      filename = data.invoice.number!.replace(/[^A-Za-z0-9_-]/g, "_") + ".pdf";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
