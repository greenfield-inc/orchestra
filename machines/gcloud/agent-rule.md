## gcloud: the folder picks the identity; never switch it or sign in

Two Google identities are used side by side, and `~/.zshenv` (via
`~/.config/zsh/gcloud-by-folder.zsh`) picks the right one from the current
folder for every shell, including agent shells:

- `~/repos/dcouple/**`, `~/repos/greenfield/**`, `~/repos/morph/**`,
  `~/repos/grain/**` → `tyler@dcouple.ai`, gcloud configuration `morph`
  (project `morph-495813`), ADC file `~/.config/gcloud/adc/dcouple.json`.
- `~/repos/bloomapi/**` → `tyler@bloomapi.com`, configuration `bloomtext`
  (no default project), ADC file `~/.config/gcloud/adc/bloomapi.json`.

It works by exporting `CLOUDSDK_ACTIVE_CONFIG_NAME` and
`GOOGLE_APPLICATION_CREDENTIALS`. Both accounts are exempt from Google
Cloud reauth for the gcloud CLI and ADC, so one sign-in per machine lasts
until it is revoked. Rules:

- Never sign in or switch: no `gcloud auth login` (it overwrote a
  configuration's account before), no `gcloud auth application-default
  login`, no `gcloud config configurations activate`, no `gcloud config set
  account`. Each one changes machine-wide state or overwrites the other
  identity's credentials for every other agent.
- Check the identity with `gcloud-whoami` (or `gcloud config list`) before
  cloud work. If it's wrong, you're probably in the wrong folder; `cd` into
  the repo rather than overriding the variables.
- For a project other than the configuration's default, pass it inline
  (`--project <id>` or `GOOGLE_CLOUD_PROJECT=<id> <command>`); don't change
  the configuration.
- Reauth errors are now rare. On `invalid_rapt`, `Reauthentication failed`,
  or expired credentials: stop gcloud work, report blocked once naming the
  identity and its fix (`! gauth-grain` for tyler@dcouple.ai, `! gauth-bloom`
  for tyler@bloomapi.com; they open a browser), and don't retry or probe
  again. If Agent Farm's launch note says gcloud is unavailable, don't call
  gcloud at all.
- Other configurations (`boardgame`, `doozy`, `default`) exist for ad-hoc use
  outside these folders; the same no-switching rule applies.
