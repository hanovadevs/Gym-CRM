import QRCode from "qrcode";
import { getAttendance } from "@/modules/attendance";
import { mutationBody, failure } from "@/server/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const data = await getAttendance().code(request.headers, {
      ...(await mutationBody(request)),
      memberId: (await params).id,
    });
    const svg = await QRCode.toString(data.payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
      width: 320,
      color: { dark: "#253C58", light: "#FFFFFF" },
    });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="${data.memberCode.replace(/[^A-Za-z0-9_-]/g, "_")}-access.svg"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
