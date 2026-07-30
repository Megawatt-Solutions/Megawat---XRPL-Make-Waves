"use client";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend,
} from "chart.js";
import type { ChartOptions, TooltipItem } from "chart.js";
import { Line } from "react-chartjs-2";
import type { GrowthPoint } from "@/lib/portfolio";
import { fmtCompact } from "@/lib/format";
import { useChartTheme, alpha } from "@/lib/chartTheme";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  const t = useChartTheme();
  const labels = data.map((d) => d.month);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Principal",
        data: data.map((d) => d.principal),
        borderColor: alpha(t.text2, 0.85),
        backgroundColor: alpha(t.text2, 0.12),
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 1.6,
      },
      {
        label: "Yield",
        data: data.map((d) => d.interest),
        borderColor: t.accent,
        backgroundColor: alpha(t.accent, 0.18),
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        align: "end" as const,
        labels: { color: t.text2, boxWidth: 8, boxHeight: 8, usePointStyle: true, font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: t.elevated,
        borderColor: t.border,
        borderWidth: 1,
        padding: 12,
        titleColor: t.text,
        bodyColor: t.text2,
        callbacks: {
          label: (ctx: TooltipItem<"line">) =>
            ` ${ctx.dataset.label}: ${fmtCompact(ctx.parsed.y ?? 0, "USD")}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { color: t.muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 16 },
        border: { display: false },
      },
      y: {
        stacked: true,
        grid: { color: t.grid },
        ticks: { color: t.muted, font: { size: 11 }, callback: (v: string | number) => fmtCompact(Number(v), "USD") },
        border: { display: false },
      },
    },
  };

  return (
    <div style={{ height: 280 }}>
      <Line data={chartData} options={options} />
    </div>
  );
}
