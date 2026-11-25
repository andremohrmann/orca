# Personal dashboard host build

This branch includes upstream main through commit `a91fc0a676e324b2630a78bdc6d885f513cc9d88` (2026-11-25) with custom plugin contracts identified as `andre-dashboard-v1`. The contract minor is 11 in API major 1. This is a personal fork extension, not an official Orca release. A plugin must feature-detect every required method with `host.has`; an `engines.orca` floor alone cannot guarantee these contracts. The generated host reference and SDK describe the actual method shapes.

The explicit personal source version is `1.4.270-andre.3`. Its numeric core exceeds the matching plugin's `>=1.4.266` minimum; it does not assert that an official Orca 1.4.270 release exists. App, CLI and native launcher builds read this source version, and the packaging override uses the same value. The source SHA, contract handshake and artifact hashes identify the actual build. A base-equal prerelease would fall below that base's engine floor and must not be substituted.

This candidate includes the canonical `agents.presentation` API. Integrated review and runtime parity acceptance remain incomplete; no full reference parity is claimed. The preserved `andre.1` build from `90f0258cb49dc8e101c21bfac7324feb0baa2c85` predates this method and remains a separate artifact.

The source workspace is `dashboard-plugin-host-api`, branch `andremohrmann/dashboard-plugin-host-api`, with fork remote `https://github.com/andremohrmann/orca.git`. The separate dashboard plugin is packaged independently. No previous custom dashboard or updater branch is a dependency of this build.

## Plugin integration

First feature-detect and call `host.customContract` with no params. Require `id: 'andre-dashboard-v1'`, `version: 1`, `distribution: 'personal-fork'`, `officialRelease: null`; then feature-detect each method separately. Generated signatures live in `resources/plugins/types/orca-host.d.ts` and `docs/reference/plugin-host-api.md`.

| Surface             | Contract                                                                                                                                                               | Grant                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Worker              | provider.usage({ refresh?: boolean })                                                                                                                                  | quota:read                                           |
| Worker              | workspace.workflow({ workspaceId }), workspace.setWorkflow({ workspaceId, statusId })                                                                                  | workspace:read / workspace:write                     |
| Worker              | agents.summaries({ workspaceId })                                                                                                                                      | agent:summary                                        |
| Worker              | agents.presentation({ projectionVersion: 1, workspaceId, requestKey, continuation? })                                                                                  | agent:summary                                        |
| Worker              | agent.reveal({ workspaceId, orcaSessionId })                                                                                                                           | workspace:write                                      |
| Worker/panel/editor | window.read/close({ panelId }), window.open({ panelId, presentation, bounds? }), window.setOpacity({ panelId, opacity }), window.setStartup({ panelId, presentation }) | window:own                                           |
| Components panel    | TerminalSurface({ terminalId, label, rows? })                                                                                                                          | terminal:read, plus terminal:send for input/geometry |

Window presentation is `panel` or `popout`; startup also accepts null to disable. Opacity range is 0.2–1, unsupported on Linux. Opening/changing presentation preferences requires host-owned confirmation. Startup consent binds the exact approved install revision. Background launches stay hidden; normal opening uses the existing inactive presentation policy.

Declare `provider.usageChanged` / `agents.summariesChanged` in contributes.events with quota:read / agent:summary respectively. Their payload is `{ invalidated: true }`; re-read the bounded snapshot, retaining explicit unknown/stale/unavailable states. Refresh requests the host's existing stale-usage refresh; it does not guarantee a new reading. Summary terminalId is a nullable trusted registry join to public terminal handles. paneKey, provider session id and orcaSessionId have separate meanings. Do not parse opaque handles or join by title. Review hasReview null is unknown, false is proven none, true is attached; a null review state remains unknown.

Import TerminalSurface from `orca` and check `ui.has('TerminalSurface')`. Its rows are integer 3–80, default 12; it has no children. Its additional optional hostId prop accepts the public execution-host id verbatim: `local`, `ssh:<connection>` or `runtime:<environment>`, not a runtime UUID. Main resolves the paired catalog entry and pins the answering runtime internally. Omit the qualifier only for the current runtime's owned terminal handles; never infer an owner from titles or opaque handles.

Rendering is host-owned active-buffer text while passive and real xterm while focused, with session/renderer/terminal-bound leases. The paired adapter negotiates `terminal.plugin-preview.v1` before requesting its profile/stream/viewport contract. Existing-chat navigation requires the owner capability `session-tabs.activate-existing-agent.v1` and verifies an existing structured target before caller-only selection. Older or unknown owners are unavailable, with no launch/resume fallback. The internal input result acknowledges local transport acceptance; it does not receipt PTY application. Actual paired-runtime/platform behavior and HTML placement require separate acceptance.

Workflow assignedId preserves the raw nullable assignment; effectiveAssignedId uses the same canonical host policy and actual catalogue as Orca's board. Canonical review is the typed review slot, which uses the same provider/draft/cache eligibility guards as the dashboard. Attention unread/unseen/acknowledged are nullable and carry basis, observedAt and turn/acknowledgement clocks. A host UI snapshot may lag renderer changes; session-boundary turns without actual displaced-turn history stay unknown.

After generating the checked-in resources with the repository generation commands, build the CLI with `pnpm build:cli`. Use `node <host-workspace>/out/cli/index.js plugin types <plugin-directory> --json` to obtain this build's SDK, and the same compiled CLI for plugin validation/checks. The installed official CLI validates its own older contract. New custom grants/events can make a personal manifest incompatible with official hosts even when calls are guarded.

## Windows build path

Use the existing upstream build and electron-builder configuration. The checkout pins Node 24, pnpm 12.18.0 and Bun 1.4.4. Install the pinned package manager before installing dependencies; pnpm 9 rewrites the newer workspace lockfile and is not a suitable frozen-install tool for this checkout. Native packaging also needs the upstream Windows C++ build tools and Windows SDK, and all resources checked by the upstream packaging hooks.

In a dedicated build checkout with those prerequisites:

```powershell
$env:ORCA_BACKGROUND_LAUNCH = '1'
pnpm install --frozen-lockfile
pnpm build:release
pnpm ensure:electron-runtime
pnpm exec electron-builder --config config/electron-builder.config.cjs --win --publish never
Get-FileHash dist/orca-windows-setup.exe -Algorithm SHA256
```

`build:release` builds native resources as well as JavaScript, CLI, WSL guest, web and mobile payloads. `build:win` alone builds desktop assets but does not replace the native build prerequisite. Stop on a failed command; a partial `dist` directory is not a validated release. Record the exact source revision, dirty diff identity, package version, contract identifier, installer hash and validation evidence with the delivered artifact. No installer produced by these instructions has been accepted merely because the path is documented.

The upstream dev-channel Windows workflow is guarded by `github.repository == 'stablyai/orca'` and relies on upstream runner/release infrastructure. It does not run unchanged in André’s fork. The upstream configuration also points publishing at upstream GitHub releases and uses SignPath for release signing; `--publish never` avoids publishing, but does not grant access to signing infrastructure. A local unsigned artifact must be identified as unsigned. Do not claim it carries the upstream publisher signature.

No updater feed, channel, signing policy or application identity is changed here. This artifact therefore needs explicit manual installation by André. Startup/restart/install acceptance must use an isolated profile/display or CI before touching a live installation; background launch does not itself prove native-focus behavior. Do not bypass plugin trust review when validating the independently packaged plugin.

## Paired owner counterpart

A current official remote owner is not assumed to implement the two custom owner capabilities. Build the counterpart from the same reviewed source and verify its actual status response advertises the required contract. Do not deploy or reconfigure an existing owner merely to make acceptance pass.

The existing upstream `.github/workflows/orca-server-artifact.yml` supports manual dispatch and uses upstream build:orcad-template, server tarball packing and isolated pairing smoke scripts. It has no upstream-repository-only guard. On the fork feature branch it is the supported source path for Linux x64/arm64 counterpart artifacts and SHA256 files; it has not been dispatched by this worker. Its baseline smoke checks server startup/pairing, not the new plugin viewport or chat guards. Those need explicit client/owner acceptance with the exact artifacts. No extra server workflow, release feed, signing secret or live deployment is added here.

## Acceptance evidence

The branch-push/manual workflow `.github/workflows/personal-dashboard-windows.yml` provides a fork-owned alternative to the missing local Rust toolchain. It is limited to `andremohrmann/orca` and this feature branch, uses upstream dependency/native/Rust/mobile setup, runs the changed gate, builds without publishing and uploads an unsigned installer plus source/version/contract/SHA256 manifest. The exact branch push bootstraps this new workflow without changing the default branch; manual dispatch alone requires prior workflow availability. It has not been run merely by adding the workflow. CLI, native launcher source and packaged app use the same explicit personal version; Windows numeric file-version fields can omit the prerelease suffix. Identify the extension through `host.customContract` and the artifact manifest as well as the version.

Source declarations, SDK generation and type checks prove different things from a running build. Terminal input/paste, alternate screen, resize ownership, backpressure, disposal/revocation and reconnect need actual runtime evidence. Rich summaries must be compared with the same observed host facts; quota windows must never come from historical token totals. Native popout presentation and focus behavior require platform acceptance. Keep unavailable/unknown states visible until the corresponding source is observed and validated.

## Serial local validation

Run `pnpm check:changed --serial --base=a91fc0a676e324b2630a78bdc6d885f513cc9d88` with `ORCA_BACKGROUND_LAUNCH=1` and a foreground 900-second deadline. Serial mode runs one gate check, one selected typecheck project and one test worker at a time. Selected typecheck compilers also use one checker thread; prerequisite package/native builds and tools can have their own internal threads. It preserves the selected checks and normal failures. Do not overlap it with another build, test or compiler process. Standalone typecheck orchestration also accepts `--serial`. Plugin authoring tests accept `orca plugin test <dir> --max-workers 1` for either Node or Vitest.
