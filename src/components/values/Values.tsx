import Decimal from "decimal.js";
import {
  formatAe,
  formatMoney,
  formatPoints,
  toDecimal,
  type NumericInput,
} from "../../utils/format";

type Tone = "auto" | "neutral";

/**
 * Money label shown next to an amount. There is deliberately no "net" or
 * "take-home" option: the spec forbids calling commission income (§6.3).
 * "nach Reserve" is gross minus the 10 % reserve, before other deductions.
 */
type MoneyKind = "brutto" | "reserve" | "nachReserve" | "zuschuss";

const moneyKindLabel: Record<MoneyKind, string> = {
  brutto: "brutto",
  reserve: "Reserve",
  nachReserve: "nach Reserve",
  zuschuss: "Zuschuss",
};

/**
 * Reversals and clawbacks are negative; make them impossible to miss. The
 * check uses the value as displayed (rounded), so "-0,001" shown as "0,00"
 * isn't painted red.
 */
const toneClass = (value: NumericInput, tone: Tone, displayDigits: number) => {
  if (tone === "neutral") return "";
  const d = toDecimal(value)?.toDecimalPlaces(displayDigits, Decimal.ROUND_HALF_UP);
  return d && d.isNegative() && !d.isZero() ? "text-color-error-text" : "";
};

export const MoneyValue = ({
  value,
  kind,
  tone = "auto",
}: {
  value: NumericInput;
  kind?: MoneyKind;
  tone?: Tone;
}) => (
  <span className={`tabular-nums whitespace-nowrap ${toneClass(value, tone, 2)}`}>
    {formatMoney(value)}
    {kind && (
      <span className="ml-1 text-xs font-normal text-color-text-subtle">
        {moneyKindLabel[kind]}
      </span>
    )}
  </span>
);

export const PointsValue = ({
  value,
  fractionDigits = 2,
  isKv = false,
  tone = "auto",
}: {
  value: NumericInput;
  fractionDigits?: number;
  /** KV points get their own unit label so they're never mixed up (§3.2). */
  isKv?: boolean;
  tone?: Tone;
}) => (
  <span className={`tabular-nums whitespace-nowrap ${toneClass(value, tone, fractionDigits)}`}>
    {formatPoints(value, fractionDigits)}
    <span className="ml-1 text-xs font-normal text-color-text-subtle">
      {isKv ? "KV-P" : "P"}
    </span>
  </span>
);

export const AeValue = ({
  value,
  tone = "auto",
}: {
  value: NumericInput;
  tone?: Tone;
}) => (
  <span className={`tabular-nums whitespace-nowrap ${toneClass(value, tone, 0)}`}>
    {formatAe(value)}
    <span className="ml-1 text-xs font-normal text-color-text-subtle">AE</span>
  </span>
);
