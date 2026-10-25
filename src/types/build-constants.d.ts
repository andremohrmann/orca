// CI release builds substitute telemetry credentials; contributor builds use null and console-mirror only.
// No runtime env fallback: shell exports must not enable telemetry transmission.
declare const ORCA_BUILD_IDENTITY: 'stable' | 'rc' | null
declare const ORCA_POSTHOG_WRITE_KEY: string | null

// CI supplies the diagnostics token endpoint; null disables upload in contributor builds.
// ORCA_DIAGNOSTICS_TOKEN_URL overrides it for developers testing packaged builds against staging.
declare const ORCA_DIAGNOSTICS_TOKEN_URL: string | null

// Full commit the build was made from (`git rev-parse HEAD`); official skill installs pin to it.
declare const ORCA_BUILD_COMMIT: string

// ORCA_LAYOUT_OWNER is declared and read in one place: src/shared/layout-owner-switch.ts.

// The `owner/repo` this build checks for updates, substituted from config/update-feed-defaults.json
// (or ORCA_UPDATE_OWNER / ORCA_UPDATE_REPO). Read it through src/shared/update-feed-info.ts, which
// falls back for the bundles that leave it undefined.
declare const ORCA_UPDATE_FEED_REPO: string | null
