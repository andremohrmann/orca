# Custom Orca Windows build

This fork keeps the dashboard/live-view changes on `custom/orca-dashboard-live-view` and publishes Windows installers from `andremohrmann/orca`.

## Automatic updates

The workflow `.github/workflows/custom-windows-update.yml` runs nightly and can also be started manually from GitHub Actions.

It does this:

1. Fetches only `upstream/main` from `stablyai/orca`.
2. Rebases `custom/orca-dashboard-live-view` onto it.
3. Builds a stamped version like `1.4.179-custom.20260812031544`.
4. Compiles the updater feed to `andremohrmann/orca`.
5. Verifies the installer metadata.
6. Publishes a GitHub release tagged `custom-windows-<version>`.
7. Marks that release as latest.

Installed custom builds check this fork for updates. Official Orca builds still check `stablyai/orca`.

## Manual local build

From this worktree:

```powershell
pnpm install --frozen-lockfile
pnpm run custom:build-windows
```

The installer is written to:

```text
%TEMP%\orca-installer-build-custom-latest\orca-windows-setup.exe
```

Verify an existing local build:

```powershell
pnpm run custom:verify-windows-update
```

## Conflict recovery

If the scheduled workflow fails during rebase:

```powershell
git fetch upstream +refs/heads/main:refs/remotes/upstream/main
git switch custom/orca-dashboard-live-view
git rebase upstream/main
```

Resolve conflicts, then:

```powershell
git rebase --continue
git push origin custom/orca-dashboard-live-view --force-with-lease
```

Rerun the workflow from GitHub Actions.

## Update source in the app

Settings → General → Updates shows the compiled update source. For custom installers it should read:

```text
Update source: andremohrmann/orca
```

If it reads `stablyai/orca`, that installed app is still an official build or was built without `ORCA_UPDATE_OWNER` and `ORCA_UPDATE_REPO`.
