/** Birthdays are calendar dates, not UTC instants; don't move a local date across midnight. */
export function profileBirthdayValue(date: Date | null): string | undefined {
  if (!date || !Number.isFinite(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
