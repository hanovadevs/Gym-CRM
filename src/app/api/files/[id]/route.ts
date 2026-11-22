import { getFiles } from "@/modules/files";
import { failure } from "@/server/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await getFiles().download(
      request.headers,
      (await params).id,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return new Response(new Uint8Array(result.file.content), {
      headers: {
        "Content-Type": result.file.contentType,
        "Content-Disposition": `attachment; filename="${result.file.filename.replace(/[^A-Za-z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
