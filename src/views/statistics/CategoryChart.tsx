import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CategoryTotal } from "./utils";
import { normalizeProfit } from "../../components/contentCard/ContentCard.utils";
import { SegmentedToggle } from "../../components/segmentedToggle/SegmentedToggle";

type ChartMode = "donut" | "bar";

type CategoryChartProps = {
  data: CategoryTotal[];
  label: string;
};

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; payload?: { color?: string } }>;
}) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-md px-3 py-2 shadow-shadow-medium">
      <p className="text-sm font-medium text-color-text-main">
        {entry.name}
      </p>
      <p className="text-sm font-semibold" style={{ color: entry.payload?.color ?? "var(--color-primary)" }}>
        {normalizeProfit(entry.value ?? 0)} €
      </p>
    </div>
  );
};

const CustomLegend = ({ data }: { data: CategoryTotal[] }) => {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center">
      {data.map((entry) => (
        <div key={entry.category} className="flex items-center gap-1.5 text-xs text-color-text-subtle">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="truncate max-w-[120px]">{entry.category}</span>
          <span className="font-medium text-color-text-secondary">
            {total > 0 ? ((entry.total / total) * 100).toFixed(0) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
};

export const CategoryChart = ({ data, label }: CategoryChartProps) => {
  const [mode, setMode] = useState<ChartMode>("donut");

  if (!data.length) {
    return (
      <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-4 sm:p-6 animate-fade-in">
        <h4 className="text-base sm:text-lg font-semibold text-color-text-main mb-4">
          {label}
        </h4>
        <div className="flex items-center justify-center h-48 text-color-text-subtle text-sm">
          Keine Daten vorhanden
        </div>
      </div>
    );
  }

  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-4 sm:p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h4 className="text-base sm:text-lg font-semibold text-color-text-main">
          {label}
        </h4>
        <SegmentedToggle
          ariaLabel={label}
          value={mode}
          onChange={setMode}
          options={[
            { value: "donut", label: "Donut" },
            { value: "bar", label: "Balken" },
          ]}
        />
      </div>

      {mode === "donut" ? (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data}
                dataKey="total"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="80%"
                animationDuration={800}
                animationEasing="ease-out"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.category}
                    fill={entry.color}
                    stroke="var(--color-bg-card)"
                    strokeWidth={data.length > 1 ? 2 : 0}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <CustomLegend data={data} />
        </>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" opacity={0.3} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "var(--color-text-subtle)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${normalizeProfit(v)} €`}
            />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fill: "var(--color-text-subtle)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-border-light)", opacity: 0.15 }} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={28} animationDuration={800} animationEasing="ease-out">
              {data.map((entry) => (
                <Cell key={entry.category} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
