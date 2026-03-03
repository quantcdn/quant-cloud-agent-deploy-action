# Quant Agent Deploy Action

A GitHub Action for creating, updating, and managing AI agents on the Quant platform. Reads agent definitions from a directory structure, creates or updates agents via the API, and registers validation specs.

## Features

- **Agent Lifecycle Management**: Creates new agents or updates existing ones based on `agent.json`
- **Prompt-as-Code**: Store system prompts in version-controlled files (Markdown, text, etc.)
- **Spec Registration**: Automatically registers validation specs alongside agent definitions
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
| `specs_registered` | Number of validation specs registered |

## Directory Structure

```
agents/
  my-agent/
    agent.json              # Required — agent configuration
    prompt.md               # System prompt (referenced by prompt_file in agent.json)
    validation-spec.json    # Optional — quality validation checks
    fixtures.json           # Optional — tool fixture responses for test mode
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

## `validation-spec.json`

Defines quality checks for the agent validation pipeline:

```json
{
  "name": "assessment-quality",
  "version": "1.0",
  "threshold": 0.7,
  "checks": {
    "behavioral": [
      {
        "id": "calls-submit",
        "description": "Agent calls submit_assessment tool",
        "weight": 3,
        "assertion": {
          "type": "tool_called",
          "tool": "submit_assessment"
        }
      }
    ],
    "constraint": [
      {
        "id": "scores-in-range",
        "description": "All scores are between 1 and 10",
        "weight": 2,
        "assertion": {
          "type": "field_range",
          "path": "items[*].score",
          "min": 1,
          "max": 10
        }
      }
    ],
    "quality": [
      {
        "id": "reasoning-length",
        "description": "Each reasoning field is at least 50 chars",
        "weight": 2,
        "assertion": {
          "type": "field_length",
          "path": "items[*].reasoning",
          "min": 50
        }
      }
    ]
  }
}
```

### Available Assertion Types

| Type | Purpose | Key fields |
|------|---------|------------|
| `tool_called` | Agent called a specific tool | `tool` |
| `tool_called_with` | Tool called with specific param value | `tool`, `path`, `expected` |
| `field_length` | String field meets min/max length | `path`, `min`, `max` |
| `field_range` | Numeric field within range | `path`, `min`, `max` |
| `field_in_enum` | Field value is in allowed set | `path`, `values` |
| `array_ratio` | Array has min ratio of items matching | `path`, `condition`, `min_ratio` |
| `distinct_values` | Array has enough unique values | `path`, `min` |
| `output_contains_when` | Conditional content check | `condition`, `path`, `contains` |

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

      - name: Deploy Agents
        uses: quantcdn/quant-cloud-agent-deploy-action@v1
        id: deploy
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
