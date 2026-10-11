import type { ReactNode } from "react";

/** Filtro GET de período/parte/lote reutilizado nas listagens e no dashboard. */
export function PeriodFilter({
  start,
  end,
  party,
  lotId,
  lots,
  extra,
  showParty = true,
}: {
  start?: string | null;
  end?: string | null;
  party?: string | null;
  lotId?: number | null;
  lots?: { id: number; name: string }[];
  extra?: ReactNode;
  showParty?: boolean;
}) {
  return (
    <form method="get" className="card mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <label className="field">
        <span className="field-label text-xs">De</span>
        <input type="date" name="start" defaultValue={start ?? ""} className="input" />
      </label>
      <label className="field">
        <span className="field-label text-xs">Até</span>
        <input type="date" name="end" defaultValue={end ?? ""} className="input" />
      </label>
      {showParty && (
        <label className="field">
          <span className="field-label text-xs">Parte</span>
          <select name="party" defaultValue={party ?? ""} className="select">
            <option value="">Ambas</option>
            <option value="A">Parte A</option>
            <option value="B">Parte B</option>
          </select>
        </label>
      )}
      {lots && (
        <label className="field">
          <span className="field-label text-xs">Lote</span>
          <select name="lotId" defaultValue={lotId ?? ""} className="select">
            <option value="">Todos</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {extra}
      <button className="btn btn-primary col-span-2 self-end sm:col-span-1">Aplicar</button>
    </form>
  );
}

export function exportQuery(p: { start?: string | null; end?: string | null; party?: string | null; lotId?: number | null }) {
  const q = new URLSearchParams();
  if (p.start) q.set("start", p.start);
  if (p.end) q.set("end", p.end);
  if (p.party) q.set("party", p.party);
  if (p.lotId) q.set("lotId", String(p.lotId));
  return q.toString();
}
