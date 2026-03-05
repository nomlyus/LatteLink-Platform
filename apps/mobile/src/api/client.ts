import { GazelleApiClient } from "@gazelle/sdk-mobile";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://api.gazellecoffee.com/v1";

export const apiClient = new GazelleApiClient({
  baseUrl: API_BASE_URL
});
