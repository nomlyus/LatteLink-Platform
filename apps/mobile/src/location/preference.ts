import * as SecureStore from "expo-secure-store";
import { locationPreferenceStorageKey, type LocationPreferenceStore } from "./model";

export const secureLocationPreferenceStore: LocationPreferenceStore = {
  async get(brandId) {
    return SecureStore.getItemAsync(locationPreferenceStorageKey(brandId));
  },
  async set(brandId, locationId) {
    await SecureStore.setItemAsync(locationPreferenceStorageKey(brandId), locationId);
  },
  async clear(brandId) {
    await SecureStore.deleteItemAsync(locationPreferenceStorageKey(brandId));
  }
};
