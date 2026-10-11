"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "@/domain/money";

const CATS = [
  { key: "matriz", label: "Matrizes", color: "var(--series-1)" },
  { key: "reprodutor", label: "Reprodutores", color: "var(--series-2)" },
  { key: "cordeiro", label: "Cordeiros(as)", color: "var(--series-3)" },
  { key: "borrego", label: "Borregos(as)", color: "var(--series-4)" },
  { key: "descarte", label: "Descarte", color: "var(--series-5)" },
];

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 12,
};

type Point = { date: string; matriz: number; reprodutor: number; cordeiro: number; borrego: number; descarte: number; total: number };

/** Efetivo por categoria ao fim de cada mês (barras empilhadas, eixo único). */
export function HerdChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => ({ ...d, mes: `${d.date.slice(5, 7)}/${d.date.slice(2, 4)}` }));
  return (
    <div className="h-72 w-full" role="img" aria-label="Evolução do efetivo por categoria, mês a mês">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} labelFormatter={(l, p) => `Fim de ${l} — total ${p?.[0]?.payload?.total ?? ""}`} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} iconType="circle" />
          {CATS.map((c, i) => (
            <Bar
              key={c.key}
              dataKey={c.key}
              name={c.label}
              stackId="a"
              fill={c.color}
              stroke="var(--surface)"
              strokeWidth={1}
              radius={i === CATS.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={28}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais de uma só cor (magnitude) com valor rotulado. */
export function HBarList({ items, money = false }: { items: { name: string; value: number }[]; money?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.name} className="text-sm" title={`${i.name}: ${money ? formatCents(i.value) : i.value}`}>
          <div className="flex justify-between gap-2">
            <span>{i.name}</span>
            <span className="tabular-nums">
              {money ? formatCents(i.value) : i.value}
              <span className="ml-1 text-xs text-[var(--muted)]">{total ? `${Math.round((i.value / total) * 100)}%` : ""}</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[var(--surface-2)]">
            <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
