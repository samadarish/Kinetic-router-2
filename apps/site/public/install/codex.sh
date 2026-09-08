#!/usr/bin/env sh
set -eu

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.codex}"
CONFIG_FILE="$CONFIG_DIR/config.toml"

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
  printf '%s\n' "Codex config already exists at $CONFIG_FILE. Add the kineticRouter provider from https://kineticrouter.com/docs/integrations/codex"
  exit 0
fi

printf '%s\n' 'model_provider = "kineticrouter"' '' '[model_providers.kineticrouter]' 'name = "kineticRouter"' 'env_key = "KINETICROUTER_API_KEY"' 'base_url = "https://api.kineticrouter.com/v1"' 'wire_api = "responses"' > "$CONFIG_FILE"
printf '%s\n' "Configured kineticRouter for Codex at $CONFIG_FILE" 'Set KINETICROUTER_API_KEY in your terminal environment before starting Codex.' 'Select a model your key can access through Responses: codex -m "YOUR_AVAILABLE_MODEL_ID"'
