function trimToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveServiceBaseUrl(params: {
  envVar: string;
  serviceLabel: string;
  fallbackUrl: string;
}) {
  const { envVar, serviceLabel, fallbackUrl } = params;
  const configured = trimToUndefined(process.env[envVar]);

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envVar} must be configured in production for ${serviceLabel} upstream routing`);
  }

  return fallbackUrl;
}
