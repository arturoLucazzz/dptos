import ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";
import { buildExcelRows, excelFileName } from "@/lib/investments/compare";
import { getInvestment } from "@/lib/investments/store";
import { loadPickViews } from "@/lib/investments/workspace-data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const investment = await getInvestment(id);
  if (!investment) return new Response("Esta inversión no existe", { status: 404 });
  const panel = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);
  const rows = buildExcelRows(await loadPickViews(investment.items, panel));

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Comparar");
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col, i) => {
    col.width = i === 0 ? 28 : i === rows[0].length - 1 ? 50 : 18;
  });
  const buffer = await book.xlsx.writeBuffer();

  const name = excelFileName(investment.name);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
