import ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";
import { EXCEL_NUM_FMT, EXCEL_WIDTHS, buildExcelRows, excelFileName } from "@/lib/investments/compare";
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
  const sheet = book.addWorksheet("Comparar", { views: [{ state: "frozen", ySplit: 1 }] });
  const [header, ...body] = rows;
  sheet.addRow(header);
  const linkCol = header.length;
  for (const r of body) {
    const link = r[linkCol - 1];
    sheet.addRow(r.map((v, i) => (i === linkCol - 1 && typeof link === "string" ? { text: link, hyperlink: link } : v)));
  }
  sheet.getRow(1).font = { bold: true };
  (header as string[]).forEach((h, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = EXCEL_WIDTHS[h] ?? 18;
    const fmt = EXCEL_NUM_FMT[h];
    if (fmt) for (let r = 2; r <= rows.length; r++) sheet.getCell(r, i + 1).numFmt = fmt;
  });
  const buffer = await book.xlsx.writeBuffer();

  const name = excelFileName(investment.name);
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "Cache-Control": "no-store",
    },
  });
}
