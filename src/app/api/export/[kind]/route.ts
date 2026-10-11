import { getDb } from "@/db";
import { formatDateBR, isIsoDate, todayIso } from "@/domain/dates";
import { buildReport } from "@/server/services/reports";
import { toCsv, toPdf } from "@/server/services/importExport";
import { authed } from "@/server/http";

export const GET = authed<{ kind: string }>(async (req, user, p) => {
  const q = req.nextUrl.searchParams;
  const start = q.get("start");
  const end = q.get("end");
  const party = q.get("party");
  const lotId = Number(q.get("lotId")) || null;
  const report = await buildReport(getDb(), p.kind, {
    start: isIsoDate(start) ? start : null,
    end: isIsoDate(end) ? end : null,
    party: party === "A" || party === "B" ? party : null,
    lotId,
  });
  const base = `${p.kind}-${todayIso()}`;
  if (q.get("format") === "pdf") {
    const period = start || end ? `Período: ${start ? formatDateBR(start) : "início"} a ${end ? formatDateBR(end) : "hoje"}` : "Todo o período";
    const pdf = await toPdf(report.title, `${period} · gerado por ${user.name}`, [
      { head: report.columns.map((c) => c.label), body: report.rows.map((r) => report.columns.map((c) => String(r[c.key] ?? ""))) },
      ...(report.summary?.length ? [{ heading: "Resumo", head: ["Observação"], body: report.summary.map((s) => [s]) }] : []),
    ]);
    return new Response(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"` },
    });
  }
  return new Response(toCsv(report.rows, report.columns), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"` },
  });
});
