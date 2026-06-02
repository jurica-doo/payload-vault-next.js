import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyData } from "./utils";
import { normalizeProfit } from "../../components/contentCard/ContentCard.utils";
import { SegmentedToggle } from "../../components/segmentedToggle/SegmentedToggle";

type ChartType = "bar" | "line";

type MonthlyChartProps = {
  data: MonthlyData[];
  color: string;
  label: string;
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-md px-3 py-2 shadow-shadow-medium">
      <p className="text-sm font-medium text-color-text-main">{label}</p>
      <p className="text-sm text-color-primary font-semibold">
        {normalizeProfit(payload[0].value ?? 0)} €
      </p>
    </div>
  );
};

export const MonthlyChart = ({ data, color, label }: MonthlyChartProps) => {
  const [chartType, setChartType] = useState<ChartType>("bar");

  const hasData = data.some((d) => d.total > 0);

  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-4 sm:p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h4 className="text-base sm:text-lg font-semibold text-color-text-main">
          {label}
        </h4>
        <SegmentedToggle
          ariaLabel={label}
          value={chartType}
          onChange={setChartType}
          options={[
            { value: "bar", label: "Balken" },
            { value: "line", label: "Linie" },
          ]}
        />
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-48 text-color-text-subtle text-sm">
          Keine Daten vorhanden
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          {chartType === "bar" ? (
            <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" opacity={0.3} />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--color-text-subtle)", fontSize: 12 }}
                axisLine={{ stroke: "var(--color-border-light)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-text-subtle)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-border-light)", opacity: 0.15 }} />
              <Bar
                dataKey="total"
                fill={color}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 5, right: 20, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" opacity={0.3} />
              <XAxis
                dataKey="month"
                tick={{ fill: "var(--color-text-subtle)", fontSize: 12 }}
                axisLine={{ stroke: "var(--color-border-light)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-text-subtle)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="total"
                stroke={color}
                strokeWidth={2.5}
                dot={{ fill: color, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 0, fill: color }}
                animationDuration={1000}
                animationEasing="ease-out"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
};
