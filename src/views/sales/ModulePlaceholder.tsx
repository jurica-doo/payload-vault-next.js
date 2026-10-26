import { EmptyState } from "../../components/emptyState/EmptyState";
import { SALES_MODULES, type FeatureFlagKey } from "../../data/salesModules";

/**
 * Stand-in page for a module whose slice hasn't been built yet. Only ever
 * visible when an admin switches the module's flag on early (e.g. staging).
 */
export const ModulePlaceholder = ({ moduleKey }: { moduleKey: FeatureFlagKey }) => {
  const module = SALES_MODULES.find((m) => m.key === moduleKey);
  return (
    <EmptyState
      message={`${module?.label ?? "Modul"} – in Vorbereitung`}
      hint={module ? `${module.description} Umsetzung in Phase ${module.phase}.` : undefined}
    />
  );
};
