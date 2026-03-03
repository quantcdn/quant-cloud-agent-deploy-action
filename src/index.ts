import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BASE_URL = 'https://dashboard.quantcdn.io/api/v3';

interface AgentConfig {
  // If set, update an existing agent. If omitted, create a new one.
  agent_id?: string;

  // Required fields for agent creation.
  name: string;
  description: string;
  modelId: string;

  // System prompt — inline or loaded from a file.
  systemPrompt?: string;
  prompt_file?: string;

  // Optional agent configuration.
  temperature?: number;
  maxTokens?: number;
  allowedTools?: string[];
  allowedCollections?: string[];
  group?: string;
}

interface DeployedAgent {
  agent_id: string;
  name: string;
  created: boolean;
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

    const deployedAgents: DeployedAgent[] = [];

    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const agentDir = path.join(resolvedDir, entry.name);
      const configPath = path.join(agentDir, 'agent.json');

      if (!fs.existsSync(configPath)) {
        core.warning(`Skipping ${entry.name}: no agent.json found`);
        continue;
      }

      const config: AgentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      // Resolve system prompt from file if prompt_file is set.
      let systemPrompt = config.systemPrompt || '';
      if (config.prompt_file) {
        const promptPath = path.join(agentDir, config.prompt_file);
        if (!fs.existsSync(promptPath)) {
          core.setFailed(`Prompt file not found: ${promptPath}`);
          return;
        }
        systemPrompt = fs.readFileSync(promptPath, 'utf-8').trim();
      }

      if (!systemPrompt) {
        core.setFailed(`Agent ${entry.name}: no systemPrompt or prompt_file provided`);
        return;
      }

      // Build the agent payload matching the platform API.
      const agentPayload: Record<string, unknown> = {
        name: config.name,
        description: config.description,
        systemPrompt,
        modelId: config.modelId,
      };

      if (config.temperature !== undefined) agentPayload.temperature = config.temperature;
      if (config.maxTokens !== undefined) agentPayload.maxTokens = config.maxTokens;
      if (config.allowedTools) agentPayload.allowedTools = config.allowedTools;
      if (config.allowedCollections) agentPayload.allowedCollections = config.allowedCollections;
      if (config.group) agentPayload.group = config.group;

      let agentId = config.agent_id;
      let created = false;

      if (agentId) {
        // Update existing agent.
        core.info(`Updating agent: ${config.name} (${agentId})`);
        const url = `${baseUrl}/organizations/${organization}/ai/agents/${agentId}`;
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(agentPayload),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          core.setFailed(`Failed to update agent ${agentId}: ${response.status} ${errorBody}`);
          return;
        }

        core.info(`  Agent updated successfully`);
      } else {
        // Create new agent.
        core.info(`Creating agent: ${config.name}`);
        const url = `${baseUrl}/organizations/${organization}/ai/agents`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(agentPayload),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          core.setFailed(`Failed to create agent ${config.name}: ${response.status} ${errorBody}`);
          return;
        }

        const result = await response.json() as { agent?: { agentId?: string } };
        agentId = result.agent?.agentId;

        if (!agentId) {
          core.setFailed(`Agent creation succeeded but no agentId returned for ${config.name}`);
          return;
        }

        core.info(`  Agent created with ID: ${agentId}`);
        created = true;

        // Write the agent_id back to agent.json so subsequent runs update instead of create.
        config.agent_id = agentId;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        core.info(`  Updated agent.json with agent_id`);
      }

      deployedAgents.push({ agent_id: agentId, name: config.name, created });
    }

    core.setOutput('deployed_agents', JSON.stringify(deployedAgents.map(a => a.agent_id)));

    core.info('');
    core.info('=== Deploy Summary ===');
    for (const agent of deployedAgents) {
      core.info(`  ${agent.created ? 'Created' : 'Updated'}: ${agent.name} (${agent.agent_id})`);
    }
  } catch (error) {
    core.setFailed(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

run();
