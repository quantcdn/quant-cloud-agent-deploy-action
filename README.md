# Quant Agent Deploy Action

A GitHub Action for creating, updating, and managing AI agents on the Quant platform. Reads agent definitions from a directory structure and creates or updates agents via the API.

## Features

- **Agent Lifecycle Management**: Creates new agents or updates existing ones based on `agent.json`
- **Prompt-as-Code**: Store system prompts in version-controlled files (Markdown, text, etc.)
- **Idempotent**: First run creates agents and writes back the `agent_id`; subsequent runs update

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `quant_api_key` | Yes | Quant API key |
| `quant_organization` | Yes | Quant organisation name |
| `agents_dir` | Yes | Directory containing agent definitions (default: `agents/`) |
| `base_url` | No | Quant API base URL |

## Outputs

| Output | Description |
|--------|-------------|
| `deployed_agents` | JSON array of deployed agent IDs |

## Directory Structure

```
agents/
  my-agent/
    agent.json              # Required — agent configuration
    prompt.md               # System prompt (referenced by prompt_file in agent.json)
    validation-spec.json    # Quality validation checks (used by validate action)
    fixtures.json           # Tool fixture responses for test mode (used by validate action)
```

## `agent.json`

Full agent definition matching the Quant AI API:

```json
{
  "name": "QSB Assessment Agent",
  "description": "Assesses government websites against QSB accessibility standards",
  "modelId": "claude-sonnet-4-5-20250514",
  "prompt_file": "prompt.md",
  "temperature": 0.3,
  "maxTokens": 8192,
  "allowedTools": ["fetch_website_data", "submit_assessment"],
  "allowedCollections": ["qsb-standards"],
  "group": "assessments"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for the agent |
| `description` | Yes | Description of what the agent does |
| `modelId` | Yes | AI model to use (e.g. `claude-sonnet-4-5-20250514`) |
| `systemPrompt` | * | Inline system prompt (use this or `prompt_file`) |
| `prompt_file` | * | Path to prompt file relative to agent directory (use this or `systemPrompt`) |
| `temperature` | No | Model temperature 0-1 (default: platform default) |
| `maxTokens` | No | Maximum output tokens (default: platform default) |
| `allowedTools` | No | Array of tool names the agent can use |
| `allowedCollections` | No | Array of vector collection IDs for RAG |
| `group` | No | Agent group for organisation |
| `agent_id` | No | Existing agent UUID — if omitted, a new agent is created |

\* One of `systemPrompt` or `prompt_file` is required.

### First Run vs Subsequent Runs

On the first run, if `agent_id` is not set in `agent.json`, the action creates a new agent via the API and **writes the returned `agent_id` back into `agent.json`**. Commit this change so subsequent runs update the existing agent instead of creating duplicates.

## Usage

### Basic Usage

```yaml
- name: Deploy Agents
  uses: quantcdn/quant-cloud-agent-deploy-action@v1
  with:
    quant_api_key: ${{ secrets.QUANT_API_KEY }}
    quant_organization: ${{ secrets.QUANT_ORGANIZATION }}
    agents_dir: agents/
```

### Complete Pipeline Example

```yaml
name: Agent Validation Pipeline
on:
  push:
    branches: [main]
    paths: ['agents/**']

jobs:
  deploy-and-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy Agent
        uses: quantcdn/quant-cloud-agent-deploy-action@v1
        with:
          quant_api_key: ${{ secrets.QUANT_API_KEY }}
          quant_organization: ${{ secrets.QUANT_ORGANIZATION }}
          agents_dir: agents/

      - name: Dispatch Agent
        uses: quantcdn/quant-cloud-agent-dispatch-action@v1
        id: dispatch
        with:
          quant_api_key: ${{ secrets.QUANT_API_KEY }}
          quant_organization: ${{ secrets.QUANT_ORGANIZATION }}
          agent_id: ${{ vars.AGENT_ID }}
          test_fixtures: agents/my-agent/fixtures.json

      - name: Validate Agent Output
        uses: quantcdn/quant-cloud-agent-validate-action@v1
        with:
          quant_api_key: ${{ secrets.QUANT_API_KEY }}
          quant_organization: ${{ secrets.QUANT_ORGANIZATION }}
          agent_id: ${{ vars.AGENT_ID }}
          agent_output: ${{ steps.dispatch.outputs.agent_output }}
          validation_spec: agents/my-agent/validation-spec.json
          conversation_context: ${{ steps.dispatch.outputs.conversation_context }}
          test_fixtures: agents/my-agent/fixtures.json
```

## Error Handling

The action will fail if:
- The API key or organization is invalid
- The agents directory does not exist
- An `agent.json` is missing required fields (`name`, `description`, `modelId`)
- No `systemPrompt` or `prompt_file` is provided
- A referenced `prompt_file` does not exist
- The API returns an error during agent creation or update

## Development

### Building

```bash
npm install
npm run build
```

### Testing

```bash
npm test
```

## License

This project is licensed under the MIT License.
