"use client";
// NAV-per-unit line chart from the oracle's on-chain navHistory — no indexer.
// Sweep snapshots get a visible marker so the stage audience can see each
// month land.
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip,
} from "chart.js";
import type { ChartOptions, TooltipItem } from "chart.js";
import { Line } from "react-chartjs-2";
import { fmtMoney } from "@/lib/format";
import { useChartTheme, alpha } from "@/lib/chartTheme";
import type { NavPointView, SweepEventView } from "@/lib/stream/StreamProvider";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export function NavChart({ history, sweeps }: { history: NavPointView[]; sweeps: SweepEventView[] }) {
  const t = useChartTheme();

  const points = history.filter((p) => p.totalUnits > 0n);
  const sweepTimes = new Set(sweeps.map((s) => s.timestamp));
  const labels = points.map((p) =>
    new Date(p.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  const values = points.map((p) => Number((p.poolNav * 1_000_000n) / p.totalUnits) / 1e6);

  const chartData = {
    labels,
    datasets: [
      {
        label: "NAV per unit",
        data: values,
        borderColor: t.accent,
        backgroundColor: alpha(t.accent, 0.14),
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        // sweep snapshots are drawn as dots; conversions/epochs stay flat
        pointRadius: points.map((p) => (sweepTimes.has(p.timestamp) ? 3.5 : 0)),
        pointBackgroundColor: t.accent,
        pointHoverRadius: 5,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      tooltip: {
        backgroundColor: t.elevated,
        borderColor: t.border,
        borderWidth: 1,
        padding: 12,
        titleColor: t.text,
        bodyColor: t.text2,
        callbacks: {
          label: (ctx: TooltipItem<"line">) => ` NAV/unit: ${fmtMoney(ctx.parsed.y ?? 0, "USD", 4)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: t.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 24 },
        border: { display: false },
      },
      y: {
        grid: { color: t.grid },
        ticks: { color: t.muted, font: { size: 11 }, callback: (v: string | number) => fmtMoney(Number(v), "USD", 2) },
        border: { display: false },
      },
    },
  };

  const summary = points.length
    ? `NAV per unit, ${labels[0]} to ${labels[labels.length - 1]}: ${fmtMoney(values[0], "USD", 2)} to ${fmtMoney(
        values[values.length - 1], "USD", 2
      )}. Dots mark monthly revenue sweeps.`
    : "NAV per unit chart: no vintage units live yet.";

  if (!points.length) {
    return (
      <p className="muted" style={{ fontSize: 13, padding: "32px 0", textAlign: "center" }}>
        NAV history starts at the first tranche conversion.
      </p>
    );
  }

  return (
    <div style={{ height: 260 }}>
      <Line data={chartData} options={options} role="img" aria-label={summary} />
    </div>
  );
}
