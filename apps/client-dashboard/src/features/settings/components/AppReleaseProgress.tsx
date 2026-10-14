import React from "react";
import type { useOnboarding } from "../../onboarding/use-onboarding";
import { getMobileReleaseStatusLabel } from "../../onboarding/onboarding-domain";

export function AppReleaseProgress({ setup }: { setup: ReturnType<typeof useOnboarding> }) {
  const release = setup.summary?.mobileRelease;
  return <section aria-label="Nomly app release progress">
    <h3>App release · managed by Nomly</h3>
    <p className="muted-copy">{getMobileReleaseStatusLabel(release?.status, release?.statusLabel)}. Release progress is separate from your completed brand setup.</p>
    {release?.buildNumber ? <p>Build {release.buildNumber}</p> : null}
    {release?.blockedReason ? <p role="status">{release.blockedReason}</p> : null}
    <div className="dash-owner-settings-actions">
      {release?.testFlightUrl ? <a className="button button--secondary" href={release.testFlightUrl} target="_blank" rel="noreferrer">TestFlight</a> : null}
      {release?.appStoreUrl ? <a className="button button--secondary" href={release.appStoreUrl} target="_blank" rel="noreferrer">App Store</a> : null}
    </div>
    {setup.buildJobsError ? <div role="alert">Release activity is temporarily unavailable.<button className="button button--ghost" onClick={() => { void setup.reload(true); }}>Retry</button></div> : setup.buildJobs.jobs.length ? <ul>{setup.buildJobs.jobs.slice(0, 3).map((job) => <li key={job.jobId}>{job.profile === "production" ? "Production" : "Beta"} build · {job.status}{job.errorMessage ? <p className="muted-copy">{job.errorMessage}</p> : null}</li>)}</ul> : null}
  </section>;
}
