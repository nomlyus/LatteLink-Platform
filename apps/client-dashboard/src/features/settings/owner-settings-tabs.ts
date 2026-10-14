export const ownerSettingsTabs = [
  ["store", "Store"], ["app", "App profile"], ["payments", "Payments"], ["launch", "Launch readiness"]
] as const;
export type OwnerSettingsTab = typeof ownerSettingsTabs[number][0];
export function resolveOwnerSettingsTab(value: string | null): OwnerSettingsTab {
  return ownerSettingsTabs.find(([id]) => id === value)?.[0] ?? "store";
}
