"use client";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip,
} from "chart.js";
import type { ChartOptions, TooltipItem } from "chart.js";
import { Line } from "react-chartjs-2";
import { tvlSeries, apySeries } from "@/lib/protocol";
import type { Range } from "@/lib/protocol";
import { fmtCompact } from "@/lib/format";
import { useChartTheme, alpha } from "@/lib/chartTheme";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const RANGES: Range[] = ["1W", "1M", "3M", "1Y", "ALL"];

const MONO_STACK = 'ui-monospace, "SFMono-Regular", Menlo, monospace';
function monoFamily() {
  if (typeof window === "undefined") return MONO_STACK;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim();
  return v || MONO_STACK;
}

export function OverviewChart({ type, title, control }: { type: "tvl" | "apy"; title: string; control?: ReactNode }) {
  const [range, setRange] = useState<Range>("ALL");
  const t = useChartTheme();

  const { data, options } = useMemo(() => {
    const fam = monoFamily();
    const tickFont = { size: 10, family: fam };
    const tooltipBase = {
      backgroundColor: t.elevated,
      borderColor: t.border,
      borderWidth: 1,
      cornerRadius: 6,
      padding: 10,
      caretSize: 0,
      titleColor: t.text,
      bodyColor: t.text2,
      titleFont: { size: 11, family: fam },
      bodyFont: { size: 11, family: fam },
    };

    if (type === "tvl") {
      const s = tvlSeries(range);
      const data = {
        labels: s.labels,
        datasets: [
          // NB: the fills used to be swapped relative to their borders —
          // green line over a purple fill, purple line over a green fill.
          {
            label: "Operational sites", data: s.deployed, borderColor: t.accent,
            backgroundColor: alpha(t.accent, 0.09), fill: true, tension: 0, pointRadius: 0, borderWidth: 1.3,
          },
          {
            label: "Replacement fund", data: s.reserves, borderColor: t.blue,
            backgroundColor: alpha(t.blue, 0.1), fill: true, tension: 0, pointRadius: 0, borderWidth: 1.3,
          },
        ],
      };
      const options: ChartOptions<"line"> = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipBase,
            callbacks: { label: (c: TooltipItem<"line">) => ` ${c.dataset.label}: ${fmtCompact(c.parsed.y ?? 0, "USD")}` },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: t.muted, font: tickFont, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, border: { display: false } },
          y: { stacked: true, position: "right", grid: { color: t.grid }, ticks: { color: t.muted, font: tickFont, maxTicksLimit: 5, callback: (v) => fmtCompact(Number(v), "USD") }, border: { display: false } },
        },
      };
      return { data, options };
    }

    const s = apySeries(range);
    const data = {
      labels: s.labels,
      datasets: [
        {
          label: "APY", data: s.values, borderColor: t.accent,
          backgroundColor: alpha(t.accent, 0.07), fill: true, tension: 0, pointRadius: 0, borderWidth: 1.4,
        },
      ],
    };
    const options: ChartOptions<"line"> = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipBase,
          filter: (c) => c.parsed.y != null,
          callbacks: { label: (c: TooltipItem<"line">) => ` ${c.dataset.label}: ${(c.parsed.y ?? 0).toFixed(2)}%` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: t.muted, font: tickFont, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, border: { display: false } },
        y: { position: "right", grid: { color: t.grid }, ticks: { color: t.muted, font: tickFont, maxTicksLimit: 5, callback: (v) => `${v}%` }, border: { display: false } },
      },
    };
    return { data, options };
  }, [type, range, t]);

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="caps" style={{ color: "var(--text-2)" }}>{title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="seg">
            {RANGES.map((r) => (
              <button key={r} className={`seg-btn ${range === r ? "active" : ""}`} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
          {control}
        </div>
      </div>
      <div style={{ height: 240 }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
