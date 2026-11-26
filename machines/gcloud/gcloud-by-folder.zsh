# Google Cloud identity by folder. Sourced from ~/.zshenv, so it runs for every
# zsh (interactive terminals and the non-interactive shells Claude Code and
# Codex use). Versioned in dcouple/orchestra machines/gcloud/; install it with
# machines/gcloud/install.sh rather than editing the installed copy.
#
#   ~/repos/dcouple, ~/repos/greenfield, ~/repos/morph, ~/repos/grain
#       -> tyler@dcouple.ai, gcloud configuration "morph" (project morph-495813)
#   ~/repos/bloomapi
#       -> tyler@bloomapi.com, gcloud configuration "bloomtext"
#
# Each identity has its own Application Default Credentials file under
# ~/.config/gcloud/adc/, so logging in for one never overwrites the other.
# Refresh them with `gauth-grain` / `gauth-bloom`. Anywhere else, nothing is set
# and gcloud uses its globally active configuration.

typeset -g _GCLOUD_ADC_DIR="$HOME/.config/gcloud/adc"

_gcloud_by_folder() {
  local config="" adc=""
  case "$PWD/" in
    "$HOME/repos/dcouple/"*|"$HOME/repos/greenfield/"*|"$HOME/repos/morph/"*|"$HOME/repos/grain/"*)
      config=morph; adc="$_GCLOUD_ADC_DIR/dcouple.json" ;;
    "$HOME/repos/bloomapi/"*)
      config=bloomtext; adc="$_GCLOUD_ADC_DIR/bloomapi.json" ;;
  esac

  if [[ -n "$config" ]]; then
    export CLOUDSDK_ACTIVE_CONFIG_NAME="$config"
    if [[ -f "$adc" ]]; then
      export GOOGLE_APPLICATION_CREDENTIALS="$adc"
    elif [[ -n "$_GCLOUD_BY_FOLDER" ]]; then
      unset GOOGLE_APPLICATION_CREDENTIALS
    fi
    export _GCLOUD_BY_FOLDER="$config"
  elif [[ -n "$_GCLOUD_BY_FOLDER" ]]; then
    # Left a mapped folder: drop only what this hook set.
    unset CLOUDSDK_ACTIVE_CONFIG_NAME GOOGLE_APPLICATION_CREDENTIALS _GCLOUD_BY_FOLDER
  fi
}

# Run a gcloud login command in its copy/paste mode (--no-launch-browser) and
# open the sign-in URL in the browser automatically. The localhost redirect
# mode is skipped on purpose: a local port watcher (e.g. Pane) sends GET / to
# every new listener, and gcloud's one-shot callback server on :8085 takes that
# probe as Google's reply and fails with "missing_code" within seconds.
# `script` keeps the terminal interactive while copying output to a log we
# watch for the URL.
_gauth_paste() {
  local log url i
  log=$(mktemp) || return
  (
    for i in {1..150}; do
      url=$(grep -m1 -oE 'https://accounts\.google\.com/o/oauth2/auth[^[:space:]]+' "$log" 2>/dev/null)
      if [[ -n "$url" ]]; then open "$url"; exit 0; fi
      sleep 0.2
    done
  ) &!
  script -qF "$log" "$@" --no-launch-browser
  local rc=$?
  command rm -f -- "$log"
  return $rc
}

# Log in one identity and save its ADC file without touching the other one.
# Uses a throwaway gcloud config dir for the ADC step, then moves the file.
_gauth() {
  local account="$1" config="$2" name="$3" quota="$4"
  echo "Signing in $account (gcloud CLI). The browser opens; pick $account, copy the code Google shows, paste it here."
  _gauth_paste env CLOUDSDK_ACTIVE_CONFIG_NAME="$config" gcloud auth login "$account" --brief --force || return
  _gauth_adc "$account" "$name" "$quota"
}

# ADC step only. Same copy/paste flow: the browser opens, pick the account,
# paste the code Google shows back here.
_gauth_adc() {
  local account="$1" name="$2" quota="$3" tmp
  mkdir -p "$_GCLOUD_ADC_DIR" && chmod 700 "$_GCLOUD_ADC_DIR"
  echo "Signing in $account for Application Default Credentials. The browser opens again; pick $account and paste the new code here."
  tmp=$(mktemp -d) || return
  _gauth_paste env -u GOOGLE_APPLICATION_CREDENTIALS CLOUDSDK_CONFIG="$tmp" gcloud auth application-default login "$account" \
    || { command rm -rf -- "$tmp"; return 1; }
  if [[ -n "$quota" ]]; then
    env -u GOOGLE_APPLICATION_CREDENTIALS CLOUDSDK_CONFIG="$tmp" gcloud auth application-default set-quota-project "$quota" --quiet >/dev/null 2>&1
  fi
  mv "$tmp/application_default_credentials.json" "$_GCLOUD_ADC_DIR/$name.json" && chmod 600 "$_GCLOUD_ADC_DIR/$name.json"
  command rm -rf -- "$tmp"
  echo "Saved $_GCLOUD_ADC_DIR/$name.json"
  _gcloud_by_folder
}
gauth-grain() { _gauth tyler@dcouple.ai morph dcouple morph-495813; }
gauth-bloom() { _gauth tyler@bloomapi.com bloomtext bloomapi ""; }
# Redo only the ADC step (when the CLI sign-in already worked).
gauth-grain-adc() { _gauth_adc tyler@dcouple.ai dcouple morph-495813; }
gauth-bloom-adc() { _gauth_adc tyler@bloomapi.com bloomapi ""; }

# Show which identity this folder uses.
gcloud-whoami() {
  echo "folder:  $PWD"
  echo "config:  ${CLOUDSDK_ACTIVE_CONFIG_NAME:-<global active>}"
  echo "account: $(gcloud config get-value account 2>/dev/null)"
  echo "project: $(gcloud config get-value project 2>/dev/null)"
  echo "ADC:     ${GOOGLE_APPLICATION_CREDENTIALS:-<global default file>}"
}

_gcloud_by_folder
autoload -Uz add-zsh-hook 2>/dev/null && add-zsh-hook chpwd _gcloud_by_folder
