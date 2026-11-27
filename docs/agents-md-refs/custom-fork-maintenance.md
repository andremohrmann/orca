# Custom fork maintenance experiment

Production stays on `custom/orca-dashboard-live-view`. The experimental branch is
`custom/orca-conflict-reduction`; do not promote it automatically or publish its
installer as the normal update. Experimental plugin/host API branches remain excluded.

## Ownership

| Feature                                                             | Custom implementation                                                                 | Upstream integration                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Live View terminals, focused input, unfocused text, remote sessions | `dashboard-popout/LiveViewTerminalPreview.tsx` and the existing session/focus modules | Grid and terminal dialog mount the custom surface; upstream `AgentTerminalPreview` is restored            |
| File links, image paste and remote clipboard                        | `live-view-terminal-links.ts`, `live-view-terminal-paste.ts`                          | Small disposable link installer in upstream compatibility setup; upstream paste/link modules are restored |
| Usage snapshot                                                      | `build-custom-dashboard-snapshot.ts`, `dashboard-usage-snapshot.ts`                   | In-window and pop-out consumers use the wrapper; upstream builder and reuse inputs are restored           |
| Provider inventory                                                  | Upstream `mapProviders` and `USAGE_PROVIDER_IDS`                                      | Export the existing inventory instead of duplicating its entries                                          |
| Native window state                                                 | `dashboard-native-ui-fields.ts`; existing native bounds/opacity modules               | Compose fields inside the lazy RPC schema; saved names and per-device storage remain intact               |
| Warp                                                                | Existing launch module and create-menu model                                          | Static menu queues the normal terminal focus handoff; upstream tab-strip renderer is restored             |
| Custom update feed                                                  | Existing feed identity/channel modules plus `updater-feed-policy.ts`                  | URL/tag/channel policy hooks; retain upstream delay, minimum-version and readiness algorithms             |
| Completion outlines and pinned slots                                | Existing Live View state-outline and layout modules                                   | Saved layout schema and grid mounts unchanged                                                             |

The restored terminal, link and paste files are removed from the automatic `--ours`
allowlist. Reconcile real changes to upstream-owned files. Never resolve every file
that differs from stock or relax bundle budgets, schema validation or checks.

The Live View auto-minimize clock pauses when hidden and when disabled/empty.
Rendered custom copy uses reactive translation. English extraction/runtime catalogs
must stay synchronized. Obsolete sidebar/preview UI mocks are removed under AGENTS.md;
parser, persistence, focus-ownership and transport contracts remain.

## Validation

Use pinned Corepack pnpm, Node 24 and the repository's Bun version. Run the changed
gate against the experiment's starting commit after final edits. Do not replace
frozen installs with lockfile regeneration. Candidate CI builds, packages and runs
the hidden packaged-startup smoke without advancing production or publishing a release.
Custom version stamping uses the published stable release as well as package.json:
upstream main can retain an old package version while stable releases advance on a
separate branch. The existing upstream dev-channel resolver chooses the next patch;
the custom suffix keeps this a distinct fork build. Failure to read the stable tag
stops stamping instead of silently emitting an obsolete version.

The upstream cross-version wire contracts remain an explicit manual runner in this
fork because the stock dedicated workflows are intentionally removed:

```sh
pnpm exec vitest run --config config/vitest.config.ts tests/e2e/cross-version-wire/
```

This is manual coverage, not a claim that candidate CI runs every upstream suite.
Before promotion, verify local/remote and worktree/folder terminals, clipboard images
and file links, IME, focus ownership, main/pop-out windows, green/orange outlines,
pins across sorting/reload, and narrow/desktop layouts. Native focus tests run only
on CI or an isolated display. No agent test may take desktop focus.

## Seven-day comparison

The former frozen-head trial was superseded on 2026-11-27 at Andre's request.
Both maintained branches now use the same scheduled merge workflow and pinned
upstream snapshot. See [paired upstream merges](paired-upstream-merges.md) for the
current schedule, evidence and reporting rules. Preserve the original external
manifest as archived evidence; do not mix its simulated observations into the
rolling trial.
