/**
 * SiliconFlow (硅基流动) Provider Configuration
 * @see https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions
 *
 * OpenAI-compatible API with additional SiliconFlow-specific features:
 * - Reasoning models support (enable_thinking, thinking_budget)
 * - Special model name format (e.g., "Pro/zai-org/GLM-4.7")
 * - Supports vision models and streaming
 */

import type {
  AIUsageInfo,
  CodeGenerationChunk,
  DeepThinkOption,
  StreamingCallback,
} from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { ChatCompletionMessageParam } from 'openai/resources/index';

const debugSiliconFlow = getDebug('ai:call:silicon-flow');
const warnSiliconFlow = getDebug('ai:call:silicon-flow', { console: true });

/**
 * SiliconFlow API base URL
 */
export const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';

/**
 * Check if the base URL is SiliconFlow provider
 */
export const isSiliconFlowProvider = (baseURL?: string): boolean => {
  if (!baseURL) return false;
  return baseURL.trim().toLowerCase().includes('siliconflow.cn');
};

/**
 * SiliconFlow-specific configuration
 */
export interface SiliconFlowConfig {
  /**
   * Enable thinking mode for reasoning models
   * Supported models: GLM-4.7, GLM-5, DeepSeek-V3.2, Qwen3 series, etc.
   */
  enableThinking?: boolean;
  /**
   * Maximum tokens for chain-of-thought output
   * Range: 128 - 32768
   */
  thinkingBudget?: number;
  /**
   * Dynamic filtering threshold (only for Qwen3)
   */
  minP?: number;
}

/**
 * Parse SiliconFlow-specific configuration from modelConfig
 */
export const parseSiliconFlowConfig = (
  modelConfig: IModelConfig,
  deepThink?: DeepThinkOption,
): SiliconFlowConfig => {
  const config: SiliconFlowConfig = {};

  // Deep think per-request override takes priority
  if (deepThink === true) {
    config.enableThinking = true;
  } else if (deepThink === false) {
    config.enableThinking = false;
  } else if (modelConfig.reasoningEnabled !== undefined) {
    config.enableThinking = modelConfig.reasoningEnabled;
  }

  // Thinking budget from model config
  if (modelConfig.reasoningBudget !== undefined) {
    config.thinkingBudget = modelConfig.reasoningBudget;
  }

  // Parse extraBody for SiliconFlow-specific params
  if (modelConfig.extraBody) {
    if (typeof modelConfig.extraBody.min_p === 'number') {
      config.minP = modelConfig.extraBody.min_p;
    }
  }

  debugSiliconFlow('SiliconFlow config parsed:', config);
  return config;
};

/**
 * Build extraBody for SiliconFlow API
 * Adds SiliconFlow-specific parameters to the request
 */
export const buildSiliconFlowExtraBody = (
  modelConfig: IModelConfig,
  modelName: string,
  deepThink?: DeepThinkOption,
): Record<string, unknown> => {
  const sfConfig = parseSiliconFlowConfig(modelConfig, deepThink);
  const extraBody: Record<string, unknown> = {};

  // Only add reasoning params if the model supports it
  const isReasoningModel = isSiliconFlowReasoningModel(modelName);

  // Add enable_thinking for reasoning models only
  if (isReasoningModel && sfConfig.enableThinking !== undefined) {
    extraBody.enable_thinking = sfConfig.enableThinking;
    debugSiliconFlow('enable_thinking:', sfConfig.enableThinking);
  } else if (!isReasoningModel && sfConfig.enableThinking !== undefined) {
    warnSiliconFlow(
      `Model "${modelName}" does not support enable_thinking. Skipping this parameter. Supported models: ${SILICONFLOW_REASONING_MODELS.join(', ')}`,
    );
  }

  // Add thinking_budget for reasoning models only
  if (isReasoningModel && sfConfig.thinkingBudget !== undefined) {
    extraBody.thinking_budget = sfConfig.thinkingBudget;
    debugSiliconFlow('thinking_budget:', sfConfig.thinkingBudget);
  }

  // Add min_p for Qwen3 models
  if (sfConfig.minP !== undefined) {
    extraBody.min_p = sfConfig.minP;
    debugSiliconFlow('min_p:', sfConfig.minP);
  }

  // Merge with user-provided extraBody (user values take priority)
  if (modelConfig.extraBody) {
    return { ...extraBody, ...modelConfig.extraBody };
  }

  return extraBody;
};

/**
 * Validate SiliconFlow model name format
 * Examples: "Pro/zai-org/GLM-4.7", "Qwen/Qwen3-32B", "deepseek-ai/DeepSeek-V3"
 */
export const validateSiliconFlowModelName = (modelName: string): boolean => {
  // SiliconFlow model names typically contain "/"
  const isValid = modelName.includes('/');
  if (!isValid) {
    warnSiliconFlow(
      `Model name "${modelName}" may not be a valid SiliconFlow model. Expected format: "vendor/model-name" (e.g., "Qwen/Qwen3-32B")`,
    );
  }
  return isValid;
};

/**
 * SiliconFlow-supported reasoning models
 * @see https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions
 */
export const SILICONFLOW_REASONING_MODELS = [
  'Pro/zai-org/GLM-5',
  'Pro/zai-org/GLM-4.7',
  'deepseek-ai/DeepSeek-V3.2',
  'Pro/deepseek-ai/DeepSeek-V3.2',
  'zai-org/GLM-4.6',
  'Qwen/Qwen3-8B',
  'Qwen/Qwen3-14B',
  'Qwen/Qwen3-32B',
  'Qwen/Qwen3-30B-A3B',
  'tencent/Hunyuan-A13B-Instruct',
  'zai-org/GLM-4.5V',
  'deepseek-ai/DeepSeek-V3.1-Terminus',
  'Pro/deepseek-ai/DeepSeek-V3.1-Terminus',
  'Qwen/Qwen3.5-397B-A17B',
  'Qwen/Qwen3.5-122B-A10B',
  'Qwen/Qwen3.5-35B-A3B',
  'Qwen/Qwen3.5-27B',
  'Qwen/Qwen3.5-9B',
  'Qwen/Qwen3.5-4B',
] as const;

/**
 * Check if the model supports reasoning/thinking mode
 */
export const isSiliconFlowReasoningModel = (modelName: string): boolean => {
  return SILICONFLOW_REASONING_MODELS.some((m) => modelName.includes(m));
};

/**
 * Get default thinking budget for SiliconFlow reasoning models
 */
export const getDefaultThinkingBudget = (): number => 4096;

/**
 * Wrap SiliconFlow-specific error handling
 */
export class SiliconFlowError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[SiliconFlow] ${message}`);
    this.name = 'SiliconFlowError';
  }
}

/**
 * Debug logging helper
 */
export const logSiliconFlowRequest = (
  modelName: string,
  isStreaming: boolean,
): void => {
  debugSiliconFlow(
    `Sending ${isStreaming ? 'streaming ' : ''}request to SiliconFlow, model: ${modelName}`,
  );
};

/**
 * Recommended environment variable setup for SiliconFlow
 *
 * ```bash
 * # Required
 * export MIDSCENE_MODEL_NAME="Qwen/Qwen3-32B"
 * export MIDSCENE_MODEL_BASE_URL="https://api.siliconflow.cn/v1"
 * export MIDSCENE_MODEL_API_KEY="your-siliconflow-api-key"
 *
 * # Recommended
 * export MIDSCENE_MODEL_FAMILY="silicon-flow"
 *
 * # Optional - for reasoning models
 * export MIDSCENE_MODEL_REASONING_ENABLED="true"
 * export MIDSCENE_MODEL_REASONING_BUDGET="4096"
 * ```
 */
export const SILICONFLOW_SETUP_GUIDE = `
SiliconFlow Setup Guide:
1. Get API Key from https://cloud.siliconflow.cn/account/ak
2. Set environment variables:
   export MIDSCENE_MODEL_NAME="Qwen/Qwen3-32B"
   export MIDSCENE_MODEL_BASE_URL="https://api.siliconflow.cn/v1"
   export MIDSCENE_MODEL_API_KEY="sk-xxxxxxxx"
   export MIDSCENE_MODEL_FAMILY="silicon-flow"

3. For reasoning models, add:
   export MIDSCENE_MODEL_REASONING_ENABLED="true"
   export MIDSCENE_MODEL_REASONING_BUDGET="4096"
`;
