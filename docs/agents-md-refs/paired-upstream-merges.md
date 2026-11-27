# Paired custom-fork upstream merges

`custom-windows-update.yml` runs both `custom/orca-dashboard-live-view` and
`custom/orca-conflict-reduction` at **03:17 UTC daily** (04:17 Berlin in winter,
05:17 in summer). GitHub can delay scheduled jobs. One preparation job pins the
upstream SHA and both input branch heads before either Windows job starts.
Matrix fail-fast is disabled: one branch's failure must not cancel the other.

Scheduled and manually dispatched runs attempt both merges. A push validates only
that exact pushed commit and skips merging; it is not a comparison observation.
Each branch retains its own explicit conflict policy and implementation. The build
script verifies that the pinned upstream commit belongs to fetched upstream main;
it never substitutes a newer commit if main advances between jobs.

Both jobs run the branch's validation, installer build and hidden startup smoke.
Successful builds advance only their respective branches with a normal push.
Production alone publishes the normal GitHub release and update feed. The experiment
uploads a candidate installer artifact and never replaces the normal update.

Each job uploads `merge-observation-<production|experiment>-<run>-<attempt>` even
when it fails. The JSON records input and upstream SHAs, raw conflict paths and
stage entries, remaining conflicts after explicit policy, merge state, result head
and job status. Missing evidence or `merge-error`/`not-attempted` is not a clean
merge. Build failures and source-merge conflicts are separate outcomes.

Compare paired scheduled runs over seven days, grouping repeated upstream SHAs.
Use the first attempt when measuring merge friction; preserve later attempts as
repair evidence. Record manual repairs and feature changes. If one side lacks
evidence, retain the incomplete pair rather than inventing a result or rerunning
only that branch against a different upstream snapshot.

The former frozen-head simulation is superseded by this rolling, maintained-branch
comparison at the user's request on 2026-11-27. Its manifest and evidence remain
archived separately. Neither the new schedule nor the report promotes the experiment
or installs a candidate automatically.
