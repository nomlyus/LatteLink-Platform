/** Group-qualified canonical targets avoid pushing compatibility redirects onto live tab history. */
export const tabDestinations = {
  home: "/(tabs)/(navigation)/home",
  menu: "/(tabs)/(navigation)/menu",
  orders: "/(tabs)/orders",
  rewards: "/(tabs)/(navigation)/rewards",
  search: "/(tabs)/(navigation)/search",
  account: "/(tabs)/account"
} as const;
