/** CNPJ numeric and alphanumeric coexist; characters use ASCII value minus 48. */
export function cnpjFromBase(base: string): string {
  if (!/^[A-Z0-9]{12}$/.test(base)) throw new Error("Base do CNPJ inválida.");
  const digit = (text: string, weights: number[]) => {
    const rest =
      [...text].reduce(
        (sum, char, i) => sum + (char.charCodeAt(0) - 48) * weights[i]!,
        0,
      ) % 11;
    return rest < 2 ? "0" : String(11 - rest);
  };
  const first = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const full =
    base + first + digit(base + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${full.slice(0, 2)}.${full.slice(2, 5)}.${full.slice(5, 8)}/${full.slice(8, 12)}-${full.slice(12)}`;
}
export function normalizeCnpj(value: string): string {
  if (!/^[A-Za-z0-9./-]+$/.test(value.trim())) return value.trim();
  const raw = value.trim().toUpperCase().replace(/[./-]/g, "");
  if (!/^[A-Z0-9]{12}\d{2}$/.test(raw)) return value.trim().toUpperCase();
  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12)}`;
}
export function validCnpj(value: string): boolean {
  const normalized = normalizeCnpj(value);
  const raw = normalized.replace(/[./-]/g, "");
  if (!/^[A-Z0-9]{12}\d{2}$/.test(raw) || /^(\d)\1{13}$/.test(raw))
    return false;
  return cnpjFromBase(raw.slice(0, 12)) === normalized;
}
