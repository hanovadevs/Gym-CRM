import { getReport } from "@/modules/reports/service";
import { reportCsv } from "@/modules/reports/csv";
import { failure } from "@/server/http";
export async function GET(request: Request) {
  try {
    const d = await getReport(
      request.headers,
      Object.fromEntries(new URL(request.url).searchParams),
      true,
    );
    return new Response(
      reportCsv(
        d.headers,
        d.rows.map((r) => r.values),
      ),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mojym-${d.query.report}-${d.query.from}-${d.query.to}.csv"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
