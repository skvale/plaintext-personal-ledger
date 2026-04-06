/**
 * Parse a commodity directive like "$1,000.00" or "€1.000,00" into formatting config.
 */
export interface CommodityFormat {
  symbol: string;
  symbolBefore: boolean;
  thousandsSep: string;
  decimalSep: string;
  decimals: number;
}

export function parseCommodity(directive: string): CommodityFormat {
  const d = directive.trim();

  // Extract the currency symbol (non-digit, non-separator chars)
  const symbolMatch = d.match(/^([^\d\s.,]+)|([^\d\s.,]+)$/);
  const symbol = symbolMatch?.[1] ?? symbolMatch?.[2] ?? "$";
  const symbolBefore = d.startsWith(symbol);

  // Get the numeric part
  const numeric = d.replace(symbol, "").trim();

  // Determine decimal separator: last occurrence of . or ,
  const lastDot = numeric.lastIndexOf(".");
  const lastComma = numeric.lastIndexOf(",");

  let decimalSep = ".";
  let thousandsSep = ",";
  let decimals = 2;

  if (lastComma > lastDot) {
    // European style: 1.000,00
    decimalSep = ",";
    thousandsSep = ".";
    decimals = numeric.length - lastComma - 1;
  } else if (lastDot >= 0) {
    // US/UK style: 1,000.00
    decimalSep = ".";
    thousandsSep = ",";
    decimals = numeric.length - lastDot - 1;
  } else {
    // No decimal (e.g. ¥1,000)
    decimals = 0;
  }

  return { symbol, symbolBefore, thousandsSep, decimalSep, decimals };
}

/**
 * Format a number using the parsed commodity format.
 */
export function formatAmount(n: number, fmt: CommodityFormat): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(fmt.decimals);
  const [intPart, decPart] = fixed.split(".");

  // Add thousands separators
  // Check for Indian lakhs grouping (symbol is ₹)
  let grouped: string;
  if (fmt.symbol === "₹") {
    // Indian: last 3 digits, then groups of 2
    if (intPart.length <= 3) {
      grouped = intPart;
    } else {
      const last3 = intPart.slice(-3);
      const rest = intPart.slice(0, -3);
      const pairs = rest.replace(/\B(?=(\d{2})+(?!\d))/g, fmt.thousandsSep);
      grouped = pairs + fmt.thousandsSep + last3;
    }
  } else {
    grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.thousandsSep);
  }

  const num = fmt.decimals > 0 ? grouped + fmt.decimalSep + decPart : grouped;
  const sign = n < 0 ? "-" : "";
  return fmt.symbolBefore
    ? `${sign}${fmt.symbol}${num}`
    : `${sign}${num}${fmt.symbol}`;
}

/** Split a formatted amount into { sign, symbol, number } for styled rendering */
export function splitAmount(
  n: number,
  fmt: CommodityFormat,
): { sign: string; symbol: string; number: string } {
  const full = formatAmount(n, fmt);
  const sign = n < 0 ? "−" : "";
  const abs = formatAmount(Math.abs(n), fmt);
  const sym = fmt.symbol;
  const num = abs.replace(sym, "");
  return { sign, symbol: sym, number: num };
}
