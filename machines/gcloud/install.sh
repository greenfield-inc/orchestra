#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Install the gcloud folder script and the gcloud agent rule for the current user.

Usage: install.sh [--dry-run] [--help]

  --dry-run  Report would-apply/already-correct for each item; change nothing.
  --help     Show this help.

Installs gcloud-by-folder.zsh to ~/.config/zsh/ and puts agent-rule.md, between
markers, into ~/.codex/AGENTS.md and ~/.claude/CLAUDE.md (once when one links to
the other). Never runs gcloud and never touches credentials or configurations.
USAGE
}

DRY_RUN=0
while (( $# > 0 )); do
  case $1 in
    --dry-run) DRY_RUN=1 ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BEGIN='<!-- orchestra:gcloud-rule begin (machines/gcloud/agent-rule.md) -->'
END='<!-- orchestra:gcloud-rule end -->'
STAMP=$(date +%Y%m%d-%H%M%S)

report() { printf '%-32s %s\n' "$1" "$2"; }

# The script: copy when it differs, keeping the previous copy beside it.
script_src=$SCRIPT_DIR/gcloud-by-folder.zsh
script_dst=$HOME/.config/zsh/gcloud-by-folder.zsh
if [[ -f $script_dst ]] && cmp -s "$script_src" "$script_dst"; then
  report folder-script already-correct
elif (( DRY_RUN )); then
  report folder-script would-apply
else
  mkdir -p "$HOME/.config/zsh"
  [[ -f $script_dst ]] && cp -p "$script_dst" "$script_dst.bak-$STAMP"
  cp "$script_src" "$script_dst"
  report folder-script applied
fi

if grep -Fqs 'gcloud-by-folder.zsh' "$HOME/.zshenv"; then
  report zshenv-sources-script already-correct
else
  report zshenv-sources-script "manual: add to ~/.zshenv: [[ -r ~/.config/zsh/gcloud-by-folder.zsh ]] && source ~/.config/zsh/gcloud-by-folder.zsh"
fi

# Print FILE with the rule block in place: between the markers if present,
# else replacing an unmarked "## gcloud:" section up to the next "## " heading,
# else appended.
render_rule() {
  awk -v begin="$BEGIN" -v end="$END" -v rule="$SCRIPT_DIR/agent-rule.md" '
    function emit(  line) {
      print begin
      while ((getline line < rule) > 0) print line
      close(rule)
      print end
      done = 1
    }
    $0 == begin { skip = "marker"; emit(); next }
    skip == "marker" { if ($0 == end) skip = ""; next }
    !done && /^## gcloud:/ { skip = "section"; emit(); next }
    skip == "section" { if (/^## /) { skip = ""; print ""; print } ; next }
    { print }
    END {
      if (!done) { if (NR > 0) print ""; emit() }
    }
  ' "$1"
}

seen=""
for target in "$HOME/.codex/AGENTS.md" "$HOME/.claude/CLAUDE.md"; do
  name=rule:${target#"$HOME"/}
  real=$(realpath "$target" 2>/dev/null || printf '%s' "$target")
  if [[ " $seen " == *" $real "* ]]; then
    report "$name" "already-correct (links to the file above)"
    continue
  fi
  seen="$seen $real"
  current=""
  [[ -f $real ]] && current=$(cat "$real")
  wanted=$(render_rule <(printf '%s' "$current"))
  if [[ -f $real && $current == "$wanted" ]]; then
    report "$name" already-correct
  elif (( DRY_RUN )); then
    report "$name" would-apply
  else
    mkdir -p "$(dirname "$real")"
    [[ -f $real ]] && cp -p "$real" "$real.bak-$STAMP"
    printf '%s\n' "$wanted" >"$real"
    report "$name" applied
  fi
done
