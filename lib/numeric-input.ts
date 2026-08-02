/**
 * Normalize typed numeric strings so controlled inputs do not keep leading zeros
 * ("020" → "20") while still allowing empty and in-progress decimals ("0.", ".").
 */

export function sanitizeNumericInput(
  raw: string,
  options?: { allowDecimal?: boolean }
): string {
  const allowDecimal = options?.allowDecimal ?? true;
  if (raw === "") return "";

  let cleaned = "";
  let seenDot = false;
  let i = 0;
  if (raw[0] === "-") {
    cleaned = "-";
    i = 1;
  }
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (ch >= "0" && ch <= "9") {
      cleaned += ch;
    } else if (allowDecimal && ch === "." && !seenDot) {
      cleaned += ".";
      seenDot = true;
    }
  }

  if (cleaned === "-" || cleaned === "." || cleaned === "-.") return cleaned;

  const neg = cleaned.startsWith("-");
  const body = neg ? cleaned.slice(1) : cleaned;
  const dot = body.indexOf(".");
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const fracPart = dot === -1 ? null : body.slice(dot + 1);

  // Strip leading zeros: 020 → 20, keep a lone 0.
  const intNorm = intPart.replace(/^0+(?=\d)/, "");

  const sign = neg ? "-" : "";
  if (fracPart != null) {
    return `${sign}${intNorm === "" ? "0" : intNorm}.${fracPart}`;
  }
  return `${sign}${intNorm}`;
}

export function parseNumericInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (
    trimmed === "" ||
    trimmed === "-" ||
    trimmed === "." ||
    trimmed === "-." ||
    trimmed.endsWith(".")
  ) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
