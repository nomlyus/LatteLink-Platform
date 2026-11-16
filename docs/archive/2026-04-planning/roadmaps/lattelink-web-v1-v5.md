# LatteLink Web Roadmap (V1-V5)

Last updated: `2026-04-01`

## Current State

The LatteLink web app in `apps/lattelink-web` is the public marketing and brand surface.

It now has:

- live production deployment on Vercel
- a stronger startup landing page
- better mobile responsiveness
- basic production metadata, sitemap, and robots support

Key current gaps:

- deeper conversion flow
- lead qualification and CRM handoff
- content/programmatic growth surfaces
- proof/case-study depth
- self-serve onboarding hooks

## V1

### Goal

Be credible enough to support live startup outreach and early client conversations.

### Scope

- premium public landing experience
- clear positioning
- domain, SEO, and deploy reliability

### Deliverables

- polished homepage
- responsive design
- Vercel production + preview workflow
- custom domain and metadata correctness
- clear CTA path for demos or contact

### Exit Criteria

- the site can be used in outreach, pitches, and pilot conversations without undermining trust

## V2

### Goal

Turn the site from a brand page into a real conversion surface.

### Scope

- better proof and trust
- clearer lead capture
- stronger narrative around product value

### Deliverables

- real proof points and pilot language
- stronger CTA flow:
  - booking
  - contact form
  - qualification copy
- analytics and funnel instrumentation
- structured data and SEO refinement
- clearer messaging by customer segment

### Engineering Changes

- integrate a real booking/contact path
- add event tracking for CTA and scroll depth
- tighten copy architecture for cold traffic

### Exit Criteria

- the site can convert cold visitors into qualified conversations

## V3

### Goal

Expand the site into a growth and education surface.

### Scope

- more pages
- content foundation
- segment-specific messaging

### Deliverables

- feature pages
- integration pages
- FAQ/resources
- content or blog foundation
- comparison and problem-solution pages
- better social/share assets

### Engineering Changes

- add a lightweight content publishing model
- improve information architecture
- make content iteration faster than code-only edits

### Exit Criteria

- the site supports both brand trust and early organic/discovery growth

## V4

### Goal

Support a larger sales pipeline and more sophisticated acquisition.

### Scope

- multi-segment landing pages
- stronger proof and conversion infrastructure
- tighter handoff into onboarding

### Deliverables

- segment-specific landing pages
- case studies and customer proof surfaces
- better CRM/form routing
- partner and integration co-marketing pages
- experimentation/A-B testing setup

### Engineering Changes

- build reusable landing-page systems
- add experimentation hooks
- align marketing forms with the admin/onboarding pipeline

### Exit Criteria

- the site becomes an acquisition engine, not just a brochure

## V5

### Goal

Make LatteLink web the front door to the whole platform lifecycle.

### Scope

- top-of-funnel acquisition
- qualified sales conversion
- onboarding handoff

### Deliverables

- self-serve qualification or onboarding-start flows
- dynamic proof and customer stories
- richer product education and integration ecosystem pages
- lifecycle paths for:
  - prospects
  - active clients
  - partners
- stronger SEO/content engine

### Engineering Changes

- connect web conversion data to the admin/onboarding system
- support authenticated or semi-authenticated onboarding-start journeys where useful
- keep the site modular enough for rapid iteration as the company positioning evolves

### Exit Criteria

- the public web app supports acquisition, trust, and early-stage onboarding at the same time
