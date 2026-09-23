import * as Sentry from "@sentry/nextjs";
import { scrubInviteDetails } from "./sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    beforeSend: scrubInviteDetails,
    beforeSendTransaction: scrubInviteDetails
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
