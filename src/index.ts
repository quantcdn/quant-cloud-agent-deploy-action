import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { Configuration, AIAgentsApi, CreateAIAgentRequest, UpdateAIAgentRequest } from '@quantcdn/quant-client';

const DEFAULT_BASE_URL = 'https://dashboard.quantcdn.io';

interface AgentConfig {
  name: string;
  description: string;
  modelId: string;
  systemPrompt?: string;
  prompt_file?: string;
  temperature?: number;
  maxTokens?: number;
  allowedTools?: string[];
  allowedCollections?: string[];
  group?: string;
}

interface DeployedAgent {
  agent_id: string;
  dir_name: string;
  name: string;
  created: boolean;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('quant_api_key', { required: true });
    const organization = core.getInput('quant_organization', { required: true });
    const agentsDir = core.getInput('agents_dir', { required: true });
    const baseUrl = core.getInput('base_url') || DEFAULT_BASE_URL;

    // The SDK appends /api/v3/... paths internally, so strip it if provided.
    const basePath = baseUrl.replace(/\/api\/v3\/?$/, '');

    const config = new Configuration({
      basePath,
      accessToken: apiKey,
    });
    const agentsApi = new AIAgentsApi(config);

    const resolvedDir = path.resolve(agentsDir);
    if (!fs.existsSync(resolvedDir)) {
      core.setFailed(`Agents directory not found: ${resolvedDir}`);
      return;
    }

    // Fetch existing agents once for name-based matching.
    core.info('Fetching existing agents...');
    const existingAgents = new Map<string, string>();
    try {
      const listResponse = await agentsApi.listAIAgents(organization);
      for (const agent of listResponse.data.agents || []) {
        if (agent.name && agent.agentId) {
          existingAgents.set(agent.name, agent.agentId);
        }
      }
      core.info(`  Found ${existingAgents.size} existing agent(s)`);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || String(err);
      core.setFailed(`Failed to list existing agents: ${message}`);
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

      const agentConfig: AgentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      // Resolve system prompt from file if prompt_file is set.
      let systemPrompt = agentConfig.systemPrompt || '';
      if (agentConfig.prompt_file) {
        const promptPath = path.join(agentDir, agentConfig.prompt_file);
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

      // Match by name to determine create vs update.
      const existingId = existingAgents.get(agentConfig.name);
      let agentId: string | undefined;
      let created = false;

      if (existingId) {
        // Update existing agent matched by name.
        core.info(`Updating agent: ${agentConfig.name} (${existingId})`);

        const updateRequest: UpdateAIAgentRequest = {
          name: agentConfig.name,
          description: agentConfig.description,
          systemPrompt,
          modelId: agentConfig.modelId,
          temperature: agentConfig.temperature,
          maxTokens: agentConfig.maxTokens,
          allowedTools: agentConfig.allowedTools,
          allowedCollections: agentConfig.allowedCollections,
          group: agentConfig.group,
        };

        try {
          await agentsApi.updateAIAgent(organization, existingId, updateRequest);
          agentId = existingId;
          core.info(`  Agent updated successfully`);
        } catch (err: any) {
          const message = err.response?.data?.error || err.message || String(err);
          core.setFailed(`Failed to update agent ${existingId}: ${message}`);
          return;
        }
      } else {
        // Create new agent — no existing agent with this name.
        core.info(`Creating agent: ${agentConfig.name}`);

        const createRequest: CreateAIAgentRequest = {
          name: agentConfig.name,
          description: agentConfig.description,
          systemPrompt,
          modelId: agentConfig.modelId,
          temperature: agentConfig.temperature,
          maxTokens: agentConfig.maxTokens,
          allowedTools: agentConfig.allowedTools,
          allowedCollections: agentConfig.allowedCollections,
          group: agentConfig.group,
        };

        try {
          const response = await agentsApi.createAIAgent(organization, createRequest);
          const agent = response.data.agent as { agentId?: string } | undefined;
          agentId = agent?.agentId;

          if (!agentId) {
            core.setFailed(`Agent creation succeeded but no agentId returned for ${agentConfig.name}`);
            return;
          }

          core.info(`  Agent created with ID: ${agentId}`);
          created = true;
        } catch (err: any) {
          const message = err.response?.data?.error || err.message || String(err);
          core.setFailed(`Failed to create agent ${agentConfig.name}: ${message}`);
          return;
        }
      }

      deployedAgents.push({ agent_id: agentId!, dir_name: entry.name, name: agentConfig.name, created });
    }

    // Output a map of directory name → agent ID for easy lookup in workflows.
    const agentMap: Record<string, string> = {};
    for (const agent of deployedAgents) {
      agentMap[agent.dir_name] = agent.agent_id;
    }
    core.setOutput('deployed_agents', JSON.stringify(agentMap));

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
