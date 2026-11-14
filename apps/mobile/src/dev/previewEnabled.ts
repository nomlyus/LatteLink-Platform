import { MOBILE_API_ENVIRONMENT } from "../api/client";
import { canAccessDesignPreviews } from "./previewAccess";

export const designPreviewsEnabled = canAccessDesignPreviews(
  __DEV__, MOBILE_API_ENVIRONMENT.apiBaseUrl, MOBILE_API_ENVIRONMENT.variant
);
