#!/usr/bin/env sh
set -eu

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.codex}"
CONFIG_FILE="$CONFIG_DIR/config.toml"

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
  printf '%s\n' "Codex config already exists at $CONFIG_FILE. Add the kineticRouter provider from https://kineticrouter.com/docs/integrations/codex/websocket"
  exit 0
fi

printf '%s\n' 'model_provider = "kineticrouter"' '' '[model_providers.kineticrouter]' 'base_url = "https://api.kineticrouter.com/v1"' 'wire_api = "responses"' 'supports_websockets = true' > "$CONFIG_FILE"
printf '%s\n' "Configured kineticRouter for Codex at $CONFIG_FILE"
