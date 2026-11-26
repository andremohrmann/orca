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

Freeze the verified production and experiment SHAs in an external trial manifest.
`config/scripts/custom-fork/merge-comparison.mjs` compares both frozen heads with the
same upstream SHA at each of seven daily cutoffs. `git merge-tree --write-tree`
writes temporary Git objects but never checks out, commits or advances either branch.
The initial pair and each observation are immutable; source changes after freezing
need a new trial rather than silently changing the treatment.

Measure conflicts remaining after each branch's explicit automatic policy, raw source
conflict paths, policy-allowlisted conflicts and intentional workflow conflicts separately.
Policy classification uses Git's actual stage entries, including rename/delete cases.
Report daily results plus unique upstream snapshots
and unique conflicting paths. Repeated days exposing the same conflict are not
independent regressions. Network, tool or parser errors are missing observations,
never clean merges. The collector can backfill missed cutoffs from upstream history
when the PC is available again; that reconstruction uses commit timestamps and is
not proof of exactly what GitHub's ref pointed to during an outage or force push.

This trial measures cumulative merge friction from a fixed starting pair. It does
not measure human repair time or prove runtime compatibility of unbuilt merge trees.
The production branch keeps its existing repair automation; experiment merge probes
do not invoke it or cherry-pick its repairs. Count candidate build failures separately.
Promote only after reviewing both merge evidence and behavior/build validation.

Daily collection and the final report run through a separate Orca automation. Evidence
and the final comparison are saved outside worktrees under Codex automation support.
The PC and Orca scheduler must run, or the report is delayed until the next run.
The final report must state missing/repeated samples and disable its own schedule.
