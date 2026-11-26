# gcloud on Tyler's Macs

Versioned source for how the MacBook and the Mini pick a Google identity and
what agents are told about gcloud. Orchestra-only; no sync script copies it.

- `gcloud-by-folder.zsh`: sourced from `~/.zshenv`. The current folder picks
  the gcloud configuration (`CLOUDSDK_ACTIVE_CONFIG_NAME`) and the ADC file
  (`GOOGLE_APPLICATION_CREDENTIALS`). It defines `gauth-grain`, `gauth-bloom`
  (sign in with the paste flow, which Pane's port watcher needs) and
  `gcloud-whoami`. Sourcing it never calls gcloud.
- `agent-rule.md`: the gcloud section of the agent rules.
- `install.sh`: installs both for the current user. The script goes to
  `~/.config/zsh/`; the rule goes between markers into `~/.codex/AGENTS.md` and
  `~/.claude/CLAUDE.md` (once when one links to the other), replacing an
  unmarked `## gcloud:` section. It keeps a dated `.bak-` copy of each file it
  changes and never touches credentials or gcloud configurations.
- `no-reauth-binding.yaml`: the Access Context Manager binding that exempts
  each org's `gcloud-no-reauth@` group from reauth for the gcloud CLI and ADC
  only.
- [lost-mac.md](lost-mac.md): what to do when a Mac is lost or compromised.

## Install

On the MacBook, from this checkout:

```bash
machines/gcloud/install.sh --dry-run
machines/gcloud/install.sh
```

On the Mini, which needs no repo checkout (read
[../mac-mini/README.md](../mac-mini/README.md) first):

```bash
rsync -a --delete machines/gcloud/ <mini-alias>:gcloud-setup/
ssh <mini-alias> 'bash ~/gcloud-setup/install.sh --dry-run'
ssh <mini-alias> 'bash ~/gcloud-setup/install.sh'
```

Re-run after changing either file; an installed machine reports every item as
`already-correct`.

## The reauth exemption

Each org (dcouple.ai, bloomapi.com) has a `gcloud-no-reauth@` Google group
holding only Tyler's and Parsa's accounts, and one binding on it, created by
an admin of that org:

```bash
gcloud identity groups describe gcloud-no-reauth@<org domain> --format='value(name)'   # groups/<group key>
gcloud access-context-manager cloud-bindings create --organization=<org id> \
  --group-key=<group key> --binding-file=machines/gcloud/no-reauth-binding.yaml
gcloud access-context-manager cloud-bindings list --organization=<org id>
```

Undo: `gcloud access-context-manager cloud-bindings delete --binding=<binding id>
--organization=<org id>` restores the org's session control for the group.
Each person signs in once on each Mac after the binding exists, since a token
issued before it may keep the old session.
