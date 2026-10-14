function normalizeSearchText(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[$€,£_]/g, " ").trim();
}

export function matchesDashboardSearch(query: string, fields: readonly (string | undefined)[]) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const text = normalizeSearchText(fields.filter((field) => field !== undefined).join(" "));
  return terms.every((term) => text.includes(term));
}
