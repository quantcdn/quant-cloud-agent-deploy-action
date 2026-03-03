import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BASE_URL = 'https://dashboard.quantcdn.io/api/v3';

interface AgentConfig {
  agent_id: string;
  name: string;
  prompt_file?: string;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('quant_api_key', { required: true });
    const organization = core.getInput('quant_organization', { required: true });
    const agentsDir = core.getInput('agents_dir', { required: true });
    const baseUrl = core.getInput('base_url') || DEFAULT_BASE_URL;

    const resolvedDir = path.resolve(agentsDir);
    if (!fs.existsSync(resolvedDir)) {
      core.setFailed(`Agents directory not found: ${resolvedDir}`);
      return;
    }

    const deployedAgents: string[] = [];
    let specsRegistered = 0;

    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const agentDir = path.join(resolvedDir, entry.name);
      const configPath = path.join(agentDir, 'agent.json');
      const specPath = path.join(agentDir, 'validation-spec.json');

      if (!fs.existsSync(configPath)) {
        core.warning(`Skipping ${entry.name}: no agent.json found`);
        continue;
      }

      const config: AgentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      core.info(`Deploying agent: ${config.name} (${config.agent_id})`);

      if (fs.existsSync(specPath)) {
        const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
        const url = `${baseUrl}/organizations/${organization}/agents/${config.agent_id}/validation-spec`;

        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(spec),
        });

        if (response.ok) {
          core.info(`  Validation spec registered for ${config.agent_id}`);
          specsRegistered++;
        } else {
          const errorBody = await response.text();
          core.warning(`  Failed to register spec: ${response.status} ${errorBody}`);
        }
      }

      deployedAgents.push(config.agent_id);
    }

    core.setOutput('deployed_agents', JSON.stringify(deployedAgents));
    core.setOutput('specs_registered', specsRegistered.toString());
    core.info(`\nDeployed ${deployedAgents.length} agent(s), registered ${specsRegistered} spec(s)`);
  } catch (error) {
    core.setFailed(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

run();
