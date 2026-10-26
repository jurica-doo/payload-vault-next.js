"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendPoint = { label: string; value: number | null };

/**
 * Single-series trend (points/month, conversion over time). The caption is
 * required: every chart says what is measured and over which window.
 * Values are for drawing only; never feed them back into calculations.
 */
export const TrendChart = ({
  data,
  caption,
  valueFormatter = (v: number) => v.toLocaleString("de-DE"),
  height = 220,
}: {
  data: TrendPoint[];
  caption: string;
  valueFormatter?: (value: number) => string;
  height?: number;
}) => (
  <figure className="flex flex-col gap-2">
    <div style={{ height }} className="w-full">
      {/* initialDimension: the server render has no layout, so give Recharts a
          size to start from instead of warning about -1 × -1. */}
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border-light)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke="var(--color-text-subtle)" fontSize={12} tickLine={false} />
          <YAxis
            stroke="var(--color-text-subtle)"
            fontSize={12}
            tickLine={false}
            width={48}
            tickFormatter={(v: number) => valueFormatter(v)}
          />
          <Tooltip
            formatter={(v) => (typeof v === "number" ? valueFormatter(v) : "–")}
            contentStyle={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-light)",
              borderRadius: "var(--radius-md)",
            }}
          />
          {/* connectNulls=false: a missing month is a gap, not a zero. */}
          <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <figcaption className="text-xs text-color-text-subtle">{caption}</figcaption>
  </figure>
);
