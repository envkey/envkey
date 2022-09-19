const usdCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const formatUsd = (numCents: number) =>
  usdCurrencyFormatter.format(numCents / 100);
