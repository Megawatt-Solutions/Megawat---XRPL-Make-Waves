"use client";
import { useMemo, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend,
} from "chart.js";
import type { ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import type { Vault } from "@/lib/types";
import { getSeries } from "@/lib/telemetry";
import type { SeriesRange } from "@/lib/telemetry";
import { useChartTheme, alpha } from "@/lib/chartTheme";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const RANGES: { key: SeriesRange; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];
const INTERVAL_HOURS: Record<SeriesRange, number> = { day: 0.25, week: 3, month: 12, year: 168 };

export function SiteChart({ vault }: { vault: Vault }) {
  const [range, setRange] = useState<SeriesRange>("day");
  const [mode, setMode] = useState<"power" | "energy">("power");
  const t = useChartTheme();
  const series = useMemo(() => getSeries(vault, range), [vault, range]);
  const hasSolar = vault.spec.hasSolar;

  const k = mode === "energy" ? INTERVAL_HOURS[range] : 1;
  const unit = mode === "energy" ? "kWh" : "kW";

  const data = {
    labels: series.map((p) => p.t),
    datasets: [
      ...(hasSolar
        ? [{
            label: "Solar", yAxisID: "y", data: series.map((p) => p.solarKw * k),
            borderColor: t.amber, backgroundColor: alpha(t.amber, 0.22), fill: "origin",
            tension: 0.35, pointRadius: 0, borderWidth: 1.4,
          }]
        : []),
      {
        label: "Grid", yAxisID: "y", data: series.map((p) => p.gridKw * k),
        borderColor: t.blue, backgroundColor: alpha(t.blue, 0.14), fill: "origin",
        tension: 0.35, pointRadius: 0, borderWidth: 1.2,
      },
      {
        label: "Consumption", yAxisID: "y", data: series.map((p) => -p.consumptionKw * k),
        borderColor: t.accent, backgroundColor: alpha(t.accent, 0.2), fill: "origin",
        tension: 0.35, pointRadius: 0, borderWidth: 1.2,
      },
      {
        label: "Battery", yAxisID: "y", data: series.map((p) => p.batteryKw * k),
        borderColor: t.teal, backgroundColor: "transparent", fill: false,
        tension: 0.35, pointRadius: 0, borderWidth: 1.4,
      },
      {
        label: "SoC", yAxisID: "y1", data: series.map((p) => p.socPct),
        borderColor: t.periwinkle, backgroundColor: "transparent", fill: false,
        tension: 0.4, pointRadius: 0, borderWidth: 2, borderDash: [4, 3],
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: true, position: "top", align: "end", labels: { color: t.text2, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 11.5 } } },
      tooltip: {
        backgroundColor: t.elevated, borderColor: t.border, borderWidth: 1, padding: 10,
        titleColor: t.text, bodyColor: t.text2,
        callbacks: {
          label: (ctx) => {
            const u = ctx.dataset.yAxisID === "y1" ? "%" : unit;
            return ` ${ctx.dataset.label}: ${Math.round((ctx.parsed.y ?? 0) * 10) / 10} ${u}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: t.muted, font: { size: 10.5 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, border: { display: false } },
      y: {
        position: "left", grid: { color: t.grid },
        ticks: { color: t.muted, font: { size: 10.5 }, callback: (v) => `${v} ${unit}` }, border: { display: false },
      },
      y1: {
        position: "right", min: 0, max: 100, grid: { display: false },
        ticks: { color: t.teal, font: { size: 10.5 }, callback: (v) => `${v}%` }, border: { display: false },
        title: { display: true, text: "SoC", color: t.teal, font: { size: 11 } },
      },
    },
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.key} className={`seg-btn ${range === r.key ? "active" : ""}`} onClick={() => setRange(r.key)}>{r.label}</button>
          ))}
        </div>
        <div className="seg">
          <button className={`seg-btn ${mode === "power" ? "active" : ""}`} onClick={() => setMode("power")}>Power</button>
          <button className={`seg-btn ${mode === "energy" ? "active" : ""}`} onClick={() => setMode("energy")}>Energy</button>
        </div>
      </div>
      <div style={{ height: 320 }}>
        {/* Named for the same reason as the other charts: react-chartjs-2
            gives its canvas role="img" and no accessible name, which
            announces "image" and stops there. The label names the site, the
            range, the unit and which series are plotted — the legend a
            sighted reader gets from colour. */}
        <Line
          data={data}
          options={options}
          role="img"
          aria-label={
            `${vault.shortName} ${mode === "energy" ? "energy" : "power"}, ` +
            `${range} view, in ${unit}. Series: ${data.datasets.map((ds) => ds.label).join(", ")}.`
          }
        />
      </div>
    </div>
  );
}
