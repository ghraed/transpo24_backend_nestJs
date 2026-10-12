/** Normalize printed decimal digits without changing letters or guessing characters. */
export function printedDigits(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[٠-٩۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit <= '٩' ? 0x0660 : 0x06f0)),
    );
}

/** The vehicle form stores a year; registration cards may print a full date. */
export function registrationYear(value: string): number | null {
  const printed = printedDigits(value).trim();
  let year: number;
  if (/^\d{4}$/.test(printed)) year = Number(printed);
  else {
    const iso = printed.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/);
    const local = printed.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/);
    if (!iso && !local) return null;
    year = Number(iso ? iso[1] : local![4]);
    const month = Number(iso ? iso[3] : local![3]);
    const day = Number(iso ? iso[4] : local![1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      return null;
  }
  return year >= 1900 && year <= new Date().getFullYear() + 1 ? year : null;
}
