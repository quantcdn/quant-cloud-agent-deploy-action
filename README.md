# Quant Agent Deploy Action

A GitHub Action for deploying agent prompts and validation specs to the Quant platform. Reads agent definitions from a directory structure and registers validation specs via the Quant API.

## Features

- **Spec Registration**: Automatically registers validation specs for each agent via the Quant API
- **Directory Convention**: Reads agent definitions from a conventional directory structure
- **Idempotent Deploys**: Uses upsert semantics so specs are created or updated as needed
- **Multi-Agent Support**: Deploys specs for all agents found in the configured directory

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

The action expects the following directory structure:

```
agents/
  my-agent/
    validation-spec.json    # Quality validation spec
    fixtures.json           # Optional: tool fixture responses
  another-agent/
    validation-spec.json
    fixtures.json
```

## Usage

### Basic Usage

```yaml
- name: Deploy Agent Specs
  uses: quantcdn/quant-cloud-agent-deploy-action@v1
  with:
    quant_api_key: ${{ secrets.QUANT_API_KEY }}
    quant_organization: ${{ secrets.QUANT_ORGANIZATION }}
    agents_dir: agents/
```

### With Custom Directory

```yaml
- name: Deploy Agent Specs
  uses: quantcdn/quant-cloud-agent-deploy-action@v1
  with:
    quant_api_key: ${{ secrets.QUANT_API_KEY }}
    quant_organization: ${{ secrets.QUANT_ORGANIZATION }}
    agents_dir: .quantassure/agents/
```

### Complete Pipeline Example

```yaml
name: Deploy Agent Validation Specs
on:
  push:
    branches: [main]
    paths: ['agents/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy Agent Specs
        uses: quantcdn/quant-cloud-agent-deploy-action@v1
        id: deploy
        with:
          quant_api_key: ${{ secrets.QUANT_API_KEY }}
          quant_organization: ${{ secrets.QUANT_ORGANIZATION }}
          agents_dir: agents/

      - name: Summary
        run: |
          echo "Deployed agents: ${{ steps.deploy.outputs.deployed_agents }}"
          echo "Specs registered: ${{ steps.deploy.outputs.specs_registered }}"
```

## Error Handling

The action will fail if:
- The API key or organization is invalid
- The agents directory does not exist
- A validation spec file is malformed
- The API returns an unexpected error

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
