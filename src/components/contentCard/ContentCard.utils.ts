const normalizeProfit = (profit: number): string => {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(profit);
};

export { normalizeProfit };
