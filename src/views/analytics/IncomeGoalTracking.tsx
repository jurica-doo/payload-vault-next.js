import { useState, useMemo, useCallback } from "react";
import type { PdfRecord } from "../../hooks/usePdf/types";
import type { IncomeGoal } from "../../hooks/useAnalytics/types";
import { getMonthlyIncomeTotals } from "../../hooks/useAnalytics/forecastUtils";
import { normalizeProfit } from "../../components/contentCard/ContentCard.utils";
import { ConfirmDeleteModal } from "../../components/modal/ConfirmDeleteModal";

const MONTH_FULL_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

type IncomeGoalTrackingProps = {
  pdfs: PdfRecord[];
  incomeGoals: IncomeGoal[];
  year: number;
  onUpsert: (month: number | null, amount: number) => void;
  onRemove: (id: string) => void;
};

type GoalType = "annual" | "monthly";

export const IncomeGoalTracking = ({
  pdfs,
  incomeGoals,
  year,
  onUpsert,
  onRemove,
}: IncomeGoalTrackingProps) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("annual");
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [goalAmount, setGoalAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [validationHintAt, setValidationHintAt] = useState<string | null>(null);

  const showValidationHint = useCallback((at: string) => {
    setValidationHintAt(at);
    setTimeout(() => setValidationHintAt(null), 3000);
  }, []);

  const monthlyTotals = useMemo(() => getMonthlyIncomeTotals(pdfs), [pdfs]);
  const totalIncome = useMemo(
    () => monthlyTotals.reduce((s, m) => s + m.total, 0),
    [monthlyTotals],
  );

  const annualGoal = useMemo(
    () => incomeGoals.find((g) => g.month === null),
    [incomeGoals],
  );
  const monthlyGoals = useMemo(
    () =>
      incomeGoals
        .filter((g) => g.month !== null)
        .sort((a, b) => (a.month ?? 0) - (b.month ?? 0)),
    [incomeGoals],
  );

  const usedMonths = useMemo(
    () => new Set(monthlyGoals.map((g) => g.month)),
    [monthlyGoals],
  );

  const handleAdd = () => {
    const amount = parseFloat(goalAmount);
    if (isNaN(amount) || amount <= 0) {
      showValidationHint("add");
      return;
    }
    const month = goalType === "annual" ? null : selectedMonth;
    onUpsert(month, amount);
    setShowAddForm(false);
    setGoalAmount("");
  };

  const handleEditSave = (_goalId: string, month: number | null) => {
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      showValidationHint(_goalId);
      return;
    }
    onUpsert(month, amount);
    setEditingId(null);
    setEditAmount("");
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return "bg-color-primary";
    if (pct >= 75) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-color-error";
  };

  const getProgressTextColor = (pct: number) => {
    if (pct >= 100) return "text-color-primary";
    if (pct >= 75) return "text-emerald-500";
    if (pct >= 50) return "text-amber-500";
    return "text-color-error-text";
  };

  const canAddAnnual = !annualGoal;
  const canAddMonthly = usedMonths.size < 12;

  return (
    <div className="bg-color-bg-card border border-color-border-light rounded-radius-lg p-4 sm:p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h4 className="text-base sm:text-lg font-semibold text-color-text-main">
            Einnahmen-Ziele
          </h4>
          <p className="text-xs text-color-text-subtle mt-0.5">
            Jährliche und monatliche Einnahmen-Ziele für {year}
          </p>
        </div>
        {(canAddAnnual || canAddMonthly) && !showAddForm && (
          <button
            type="button"
            onClick={() => {
              setGoalType(canAddAnnual ? "annual" : "monthly");
              setShowAddForm(true);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-radius-md bg-color-primary text-color-black
              hover:bg-color-primary/90 transition-all duration-200 active:scale-95"
          >
            + Ziel hinzufügen
          </button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-color-bg-main rounded-radius-md p-4 mb-4 border border-color-border-light animate-fade-in">
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {canAddAnnual && (
                <button
                  type="button"
                  onClick={() => setGoalType("annual")}
                  className={`px-3 py-1.5 text-xs rounded-radius-md transition-all ${
                    goalType === "annual"
                      ? "bg-color-primary text-color-black font-medium"
                      : "bg-color-bg-card border border-color-border-light text-color-text-subtle"
                  }`}
                >
                  Jahresziel
                </button>
              )}
              {canAddMonthly && (
                <button
                  type="button"
                  onClick={() => setGoalType("monthly")}
                  className={`px-3 py-1.5 text-xs rounded-radius-md transition-all ${
                    goalType === "monthly"
                      ? "bg-color-primary text-color-black font-medium"
                      : "bg-color-bg-card border border-color-border-light text-color-text-subtle"
                  }`}
                >
                  Monatsziel
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {goalType === "monthly" && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="flex-1 bg-color-bg-card border border-color-border-light rounded-radius-md px-3 py-2 text-sm
                    text-color-text-main focus:outline-none focus:border-color-primary"
                >
                  {MONTH_FULL_NAMES.map((name, idx) => (
                    <option
                      key={idx}
                      value={idx + 1}
                      disabled={usedMonths.has(idx + 1)}
                    >
                      {name}{" "}
                      {usedMonths.has(idx + 1) ? "(bereits gesetzt)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="Ziel (€)"
                    value={goalAmount}
                    onChange={(e) => {
                      setGoalAmount(e.target.value);
                      if (validationHintAt === "add") setValidationHintAt(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    className={`w-32 bg-color-bg-card border rounded-radius-md px-3 py-2 text-sm
                      text-color-text-main focus:outline-none ${validationHintAt === "add" ? "border-amber-500" : "border-color-border-light focus:border-color-primary"}`}
                  />
                  <button
                    type="button"
                    onClick={handleAdd}
                    className="px-3 py-2 text-xs font-medium rounded-radius-md bg-color-primary text-color-black
                      hover:bg-color-primary/90 transition-all duration-200 active:scale-95"
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setGoalAmount("");
                      setValidationHintAt(null);
                    }}
                    className="px-3 py-2 text-xs font-medium rounded-radius-md bg-color-bg-card border border-color-border-light
                      text-color-text-subtle hover:text-color-text-main transition-all duration-200"
                  >
                    Abbrechen
                  </button>
                </div>
                {validationHintAt === "add" && (
                  <span className="text-xs text-amber-500 animate-fade-in">
                    Bitte einen Betrag größer als 0 eingeben.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Annual Goal */}
      {annualGoal && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 w-1 bg-color-primary rounded-full" />
            <h5 className="text-sm font-semibold text-color-text-main">
              Jahresziel {year}
            </h5>
          </div>
          {renderGoalBar({
            label: `Jahresziel ${year}`,
            goal: annualGoal.goal_amount,
            current: totalIncome,
            goalId: annualGoal.id,
            month: null,
          })}
        </div>
      )}

      {/* Monthly Goals */}
      {monthlyGoals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 w-1 bg-color-primary rounded-full" />
            <h5 className="text-sm font-semibold text-color-text-main">
              Monatsziele
            </h5>
          </div>
          <div className="space-y-4">
            {monthlyGoals.map((goal) => {
              const monthIdx = (goal.month ?? 1) - 1;
              const monthIncome = monthlyTotals[monthIdx]?.total ?? 0;
              return renderGoalBar({
                key: goal.id,
                label: MONTH_FULL_NAMES[monthIdx],
                goal: goal.goal_amount,
                current: monthIncome,
                goalId: goal.id,
                month: goal.month,
              });
            })}
          </div>
        </div>
      )}

      {!annualGoal && monthlyGoals.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-color-text-subtle text-sm gap-2">
          <p>Noch keine Einnahmen-Ziele definiert</p>
          <p className="text-xs">
            Klicke „+ Ziel hinzufügen" um ein Jahres- oder Monatsziel zu setzen
          </p>
        </div>
      )}

      {deleteId && (
        <ConfirmDeleteModal
          title="Ziel löschen"
          message={`Möchtest du das Ziel „${deleteName}" wirklich löschen?`}
          onCancel={() => setDeleteId(null)}
          onConfirm={() => {
            onRemove(deleteId);
            setDeleteId(null);
          }}
        />
      )}
    </div>
  );

  function renderGoalBar({
    label,
    goal,
    current,
    goalId,
    month,
    key,
  }: {
    label: string;
    goal: number;
    current: number;
    goalId: string;
    month: number | null;
    key?: string;
  }) {
    const pct = goal > 0 ? Math.round((current / goal) * 100) : 0;
    const remaining = goal - current;
    const isEditing = editingId === goalId;

    return (
      <div key={key ?? goalId} className="group">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-color-text-main truncate">
              {label}
            </span>
            <span
              className={`text-xs font-semibold ${getProgressTextColor(pct)}`}
            >
              {pct}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => {
                      setEditAmount(e.target.value);
                      if (validationHintAt === goalId) setValidationHintAt(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditSave(goalId, month);
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditAmount("");
                        setValidationHintAt(null);
                      }
                    }}
                    className={`w-24 bg-color-bg-card border rounded-radius-sm px-2 py-1 text-xs
                      text-color-text-main focus:outline-none ${validationHintAt === goalId ? "border-amber-500" : "border-color-border-light focus:border-color-primary"}`}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleEditSave(goalId, month)}
                    className="text-xs text-color-primary hover:text-color-primary/80 font-medium"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditAmount("");
                      setValidationHintAt(null);
                    }}
                    className="text-xs text-color-text-subtle hover:text-color-text-main"
                  >
                    ✕
                  </button>
                </div>
                {validationHintAt === goalId && (
                  <span className="text-xs text-amber-500 animate-fade-in">
                    Betrag muss größer als 0 sein.
                  </span>
                )}
              </div>
            ) : null}
            <span className="text-xs text-color-text-subtle whitespace-nowrap">
              {normalizeProfit(current)} / {normalizeProfit(goal)} €
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-3 bg-color-bg-main rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${getProgressColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        {/* Status + mobile actions */}
        <div className="flex justify-between items-center mt-1">
          <span
            className={`text-xs ${remaining > 0 ? "text-color-text-subtle" : "text-color-primary font-medium"}`}
          >
            {remaining > 0
              ? `${normalizeProfit(remaining)} € bis zum Ziel`
              : `Ziel erreicht! 🎉`}
          </span>
          {!isEditing && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingId(goalId);
                  setEditAmount(goal.toString());
                  setValidationHintAt(null);
                }}
                className="text-xs py-1 text-color-text-subtle hover:text-color-primary transition-colors"
              >
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteId(goalId);
                  setDeleteName(label);
                }}
                className="text-xs py-1 text-color-text-subtle hover:text-color-error-text transition-colors"
              >
                Löschen
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
};
