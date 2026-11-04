/**
 * Study Focus AI — Shared OpenRouter AI Client
 *
 * Provider-agnostic client for OpenRouter's OpenAI-compatible API.
 * Handles authentication, rate limiting, timeouts, retries, and usage logging.
 * All secrets (API key, model, base URL) come from Supabase Edge Function environment variables.
 */

// ============================================================================
// Types
// ============================================================================

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
  timeoutMs: number;
  maxRetries: number;
  maxRequestTokens: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIRequestOptions {
  feature: "planner" | "assistant";
  userId: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  conversationId?: string;
}

export interface AIResponse<T = string> {
  success: boolean;
  data?: T;
  error?: string;
  source: "ai" | "fallback";
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  estimatedCostUsd?: number;
}

export interface UsageLogEntry {
  feature: "planner" | "assistant";
  userId: string;
  model: string;
  status: "success" | "error" | "rate_limited" | "timeout" | "insufficient_credits" | "invalid_model";
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  errorMessage?: string;
  conversationId?: string;
}

// ============================================================================
// Configuration
// ============================================================================

function getConfig(): AIConfig {
  const apiKey = Deno.env.get("AI_API_KEY")?.trim();
  const baseUrl = (Deno.env.get("AI_BASE_URL")?.trim() || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const model = Deno.env.get("AI_MODEL")?.trim();
  const provider = (Deno.env.get("AI_PROVIDER")?.trim() || "openrouter").toLowerCase();

  if (!apiKey) {
    throw new Error("AI_API_KEY not configured in Supabase secrets");
  }
  if (!model) {
    throw new Error("AI_MODEL not configured in Supabase secrets");
  }

  return {
    apiKey,
    baseUrl,
    model,
    provider,
    timeoutMs: 30000,
    maxRetries: 2,
    maxRequestTokens: 100000,
  };
}

// ============================================================================
// Cost Estimation (OpenRouter pricing approximations)
// ============================================================================

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "meta-llama/llama-3.1-8b-instruct:free": { input: 0, output: 0 },
  "meta-llama/llama-3.1-70b-instruct:free": { input: 0, output: 0 },
  "mistralai/mistral-7b-instruct:free": { input: 0, output: 0 },
  "google/gemma-2-9b-it:free": { input: 0, output: 0 },
  "microsoft/phi-3-mini-128k-instruct:free": { input: 0, output: 0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
  "openai/gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  "anthropic/claude-3-haiku": { input: 0.25, output: 1.25 },
  "google/gemini-flash-1.5": { input: 0.075, output: 0.30 },
  "openai/gpt-4o": { input: 2.50, output: 10.00 },
  "anthropic/claude-3.5-sonnet": { input: 3.00, output: 15.00 },
  "google/gemini-pro-1.5": { input: 1.25, output: 5.00 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_COSTS[model];
  if (!pricing) return 0;
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

// ============================================================================
// Rate Limiting (in-memory, per Edge Function instance)
// ============================================================================

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

function checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(userId);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true };
}

function cleanupRateLimitBuckets(): void {
  const now = Date.now();
  for (const [userId, bucket] of rateLimitBuckets.entries()) {
    if (now > bucket.resetAt) {
      rateLimitBuckets.delete(userId);
    }
  }
}

setInterval(cleanupRateLimitBuckets, 5 * 60_000);

// ============================================================================
// HTTP Client with OpenRouter Headers
// ============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function makeOpenRouterRequest(
  config: AIConfig,
  body: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const url = `${config.baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "HTTP-Referer": Deno.env.get("APP_URL") || "https://study-focus-ai.app",
    "X-Title": "Study Focus AI",
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, config.timeoutMs);

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorData.message || errorMessage;
    } catch {}

    if (response.status === 401) throw new Error("Invalid API key");
    if (response.status === 402) throw new Error(`Insufficient credits: ${errorMessage}`);
    if (response.status === 404) throw new Error(`Model not found: ${config.model}`);
    if (response.status === 429) throw new Error(`Rate limited: ${errorMessage}`);
    if (response.status >= 500) throw new Error(`Provider error: ${errorMessage}`);

    throw new Error(errorMessage);
  }

  return response.json();
}

// ============================================================================
// Response Parsing & Validation
// ============================================================================

function parseAIResponse(response: ChatCompletionResponse): { content: string; usage?: ChatCompletionResponse["usage"] } {
  const choice = response.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error("Empty response from AI model");
  }
  if (choice.finish_reason === "content_filter") {
    throw new Error("Response filtered by content policy");
  }
  return { content: choice.message.content, usage: response.usage };
}

export function tryParseJSON<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// Database Logging (uses Supabase REST API with service_role)
// ============================================================================

async function insertUsageLog(entry: UsageLogEntry): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    // Fallback to console logging if Supabase not configured
    console.log("[AI Usage]", JSON.stringify({ ...entry, timestamp: new Date().toISOString() }));
    return;
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/ai_usage_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: entry.userId,
        feature: entry.feature,
        model: entry.model,
        status: entry.status,
        latency_ms: entry.latencyMs,
        prompt_tokens: entry.promptTokens ?? null,
        completion_tokens: entry.completionTokens ?? null,
        total_tokens: entry.totalTokens ?? null,
        estimated_cost_usd: entry.estimatedCostUsd ?? null,
        error_message: entry.errorMessage ?? null,
        conversation_id: entry.conversationId ?? null,
      }),
    });
  } catch (error) {
    // Don't throw - logging failures shouldn't break the main request
    console.error("[AI Usage Log] Failed to insert:", error);
  }
}

// ============================================================================
// Main AI Client Function
// ============================================================================

export async function callAI<T = string>(options: AIRequestOptions): Promise<AIResponse<T>> {
  const startTime = Date.now();
  const config = getConfig();

  const rateLimit = checkRateLimit(options.userId);
  if (!rateLimit.allowed) {
    const errorResponse: AIResponse<T> = {
      success: false,
      error: "Rate limit exceeded. Please wait before making more requests.",
      source: "fallback",
      latencyMs: Date.now() - startTime,
    };
    await insertUsageLog({
      feature: options.feature,
      userId: options.userId,
      model: config.model,
      status: "rate_limited",
      latencyMs: errorResponse.latencyMs,
      errorMessage: errorResponse.error,
      conversationId: options.conversationId,
    });
    return errorResponse;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.userPrompt },
  ];

  const requestBody: ChatCompletionRequest = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens ?? 2000,
  };

  if (options.responseFormat === "json") {
    requestBody.response_format = { type: "json_object" };
  }

  try {
    const response = await makeOpenRouterRequest(config, requestBody);
    const { content, usage } = parseAIResponse(response);
    const latencyMs = Date.now() - startTime;

    let parsedData: T | undefined;
    if (options.responseFormat === "json") {
      parsedData = tryParseJSON<T>(content);
      if (parsedData === null) {
        throw new Error("Failed to parse AI response as JSON");
      }
    } else {
      parsedData = content as unknown as T;
    }

    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);
    const estimatedCost = estimateCost(config.model, promptTokens, completionTokens);

    const successResponse: AIResponse<T> = {
      success: true,
      data: parsedData,
      source: "ai",
      model: config.model,
      usage: { promptTokens, completionTokens, totalTokens },
      latencyMs,
      estimatedCostUsd: estimatedCost > 0 ? estimatedCost : undefined,
    };

    await insertUsageLog({
      feature: options.feature,
      userId: options.userId,
      model: config.model,
      status: "success",
      latencyMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: successResponse.estimatedCostUsd,
      conversationId: options.conversationId,
    });

    return successResponse;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    let status: UsageLogEntry["status"] = "error";
    if (errorMessage.includes("Rate limited") || errorMessage.includes("429")) status = "rate_limited";
    else if (errorMessage.includes("timeout") || errorMessage.includes("AbortError")) status = "timeout";
    else if (errorMessage.includes("Insufficient credits") || errorMessage.includes("402")) status = "insufficient_credits";
    else if (errorMessage.includes("Model not found") || errorMessage.includes("404")) status = "invalid_model";

    const errorResponse: AIResponse<T> = {
      success: false,
      error: errorMessage,
      source: "fallback",
      latencyMs,
    };

    await insertUsageLog({
      feature: options.feature,
      userId: options.userId,
      model: config.model,
      status,
      latencyMs,
      errorMessage,
      conversationId: options.conversationId,
    });

    return errorResponse;
  }
}

// ============================================================================
// Usage Logging (public wrapper for compatibility)
// ============================================================================

export async function logUsage(entry: UsageLogEntry): Promise<void> {
  await insertUsageLog(entry);
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkAIHealth(): Promise<{ available: boolean; model: string; error?: string }> {
  try {
    const config = getConfig();
    const testResponse = await callAI({
      feature: "assistant",
      userId: "health-check",
      systemPrompt: "Reply with exactly: OK",
      userPrompt: "Health check",
      maxTokens: 10,
      temperature: 0,
    });
    return {
      available: testResponse.success,
      model: config.model,
      error: testResponse.error,
    };
  } catch (error) {
    return {
      available: false,
      model: Deno.env.get("AI_MODEL") || "unknown",
      error: error instanceof Error ? error.message : "Health check failed",
    };
  }
}
