Daily security loop, opened {{date}}. Each morning's run fixes the next open critical and high Dependabot alerts on one rolling PR. A person reviews and merges it; the merge closes this issue, and the next morning opens a new one.

This issue is the procedure. Each day's run (the first turn, and each daily reply) follows it from the top.

## Each run

1. Update this issue's branch from `origin/main` (rebase, or merge when a rebase would rewrite pushed commits someone reviewed). One branch and one PR per issue.
2. List the open alerts: `gh api --paginate 'repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100'`. Keep critical and high, critical first. Drop an alert only when an open PR **from a person** already fixes it. Dependabot's own PRs fail the release-age gate, so fix those alerts here and list the Dependabot PRs this PR supersedes.
3. For each alert pick the newest fixing version published at least 7 days ago (the repo's release-age gate, `scripts/check-npm-release-age.mjs`). If no fixing version is old enough, the alert waits; list it with the date it becomes eligible.
4. Bump at most 10 packages this run. When the open PR already holds 40 package bumps, add none and say it is waiting for a merge.
5. Follow the repo's dependency-safety rules (`apps/frontend/references/dependency-safety.md`): edit the manifest and lockfile, run `node scripts/check-npm-release-age.mjs`, and install only with `--ignore-scripts`. Python bumps use the repo's pip gate. Make the smallest code change a bump needs to build.
6. Run each touched area's gate and keep its output: `make verify` in `apps/backend` for Go, `make` in `apps/frontend` for JavaScript (a root-lockfile-only PR runs no Jest in CI, so run it here).
7. Run `BASE_SHA=$(git merge-base origin/main HEAD) node scripts/check-native-runtime.mjs` with no `PR_NUMBER` (it makes no GitHub writes). Drop any bump that moves the Expo fingerprint and list it under "Native, needs a store build".
8. Push to the branch. Open the PR on the first day, or update its body after that. Label it per `docs/github-issues-and-prs.md` (a type label, one `area:*` per app, `mobile` when mobileChat changes) plus `dependencies`, and put `Fixes <this issue's identifier>` in the body. Mark it ready for review.
9. Rewrite only the **Pending** section at the bottom of this description, then move this issue to In Review.
10. With nothing to fix and no open PR, post one line saying so and close this issue.

## The PR body

- Fixed: each alert (number, package, severity, from and to versions).
- Superseded Dependabot PRs.
- Waiting for release age, with the eligible date.
- Native, needs a store build.
- Gate output for each area, and the native-runtime result.
- What the merge deploys, from `RUNBOOK.md`: a lockfile change under `internal/finops` or `internal/housekeeping` goes to production on merge; a root `pnpm-lock.yaml` change sends an over-the-air update to the staging channel.

## May change

- Dependency manifests and lockfiles: `package.json` files and pnpm overrides, the root `pnpm-lock.yaml`, the `package.json` and `pnpm-lock.yaml` of the templates under `tools/agent-farm/`, `apps/backend/go.mod` and `go.sum`, `apps/ffdetr/requirements.txt`, `uv.lock` files.
- The smallest code change a bump needs to build and pass its gate.
- This issue's branch and PR, and this issue's description, comments and status.

## Must not

- Merge, deploy, dispatch workflows, or approve any PR, including someone else's.
- Change anything that moves the Expo fingerprint (`runtimeVersion`); list those alerts instead.
- Touch CI workflows, Terraform, k8s, secrets, `AGENTS.md`, `.github/npm-release-age-allowlist.json`, or docs beyond the PR body.
- Edit another PR's branch, or dismiss or close alerts.
- Print or commit secrets.

`docs/security/codex-security.md`'s report-only scan is separate; leave it alone.

## Pending

Filled in by each run: alerts waiting for release age, native alerts, alerts with no fix available, and stale alerts worth a person dismissing, each with its reason.
