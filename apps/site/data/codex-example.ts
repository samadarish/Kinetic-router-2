import { OPENAI_API_BASE_URL } from '@kineticrouter/platform-config/origins';

export const codexProviderConfig = `# Add this provider alongside your existing configuration.
[model_providers.kineticrouter]
name = "kineticRouter"
base_url = "${OPENAI_API_BASE_URL}"
env_key = "KINETICROUTER_API_KEY"
wire_api = "responses"`;

export const codexStartCommand = 'codex -c model_provider="kineticrouter" -m "YOUR_AVAILABLE_MODEL_ID"';
