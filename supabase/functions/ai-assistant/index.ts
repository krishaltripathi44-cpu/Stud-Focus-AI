/**
 * Study Focus AI — AI Study Assistant Edge Function
 *
 * Server-side chat with a real LLM using shared OpenRouter client.
 * API key stays server-side.
 * Falls back to a rule-based response (never presented as AI) if the provider
 * is unavailable.
 */

import { verifyAuth } from "../_shared/auth.ts";
import { callAI, logUsage } from "../_shared/ai-client.ts";

// ============================================================================
// Types
// ============================================================================

interface AssistantRequest {
  message: string;
  conversationId: string;
  context: {
    subjects: Array<{ id: string; name: string; priority: number; weeklyTargetHours: number; difficulty?: number }>;
    recentSessions: Array<{ subjectName: string; durationMinutes: number; date: string; completed: boolean }>;
    upcomingExams: Array<{ title: string; date: string; time?: string; subjectName?: string }>;
    activePlan: { id: string; title: string; sessions: Array<{ subjectName: string; dayOfWeek: number; startTime: string; endTime: string }> } | null;
    todaySessions: Array<{ subjectName: string; startTime: string; endTime: string; status: string }>;
    streak: number;
    totalHours: number;
    dailyGoalHours: number;
    weeklyProgress: { subjectId: string; subjectName: string; hoursDone: number; targetHours: number }[];
  };
}

interface AssistantAction {
  type: "create_plan" | "reschedule_sessions" | "update_goals" | "modify_sessions" | "replace_plan";
  payload: Record<string, unknown>;
  description: string;
  requiresConfirmation: boolean;
}

// ============================================================================
// System Prompt Builder
// ============================================================================

function buildSystemPrompt(ctx: AssistantRequest["context"]): string {
  const subjList = ctx.subjects.map(s => `- ${s.name} (priority ${s.priority}, target ${s.weeklyTargetHours}h/week, difficulty ${s.difficulty || 3}/5)`).join("\n") || "None yet.";
  const recent = ctx.recentSessions.slice(0, 10).map(s => `- ${s.date}: ${s.subjectName} ${s.durationMinutes}min ${s.completed ? "✓" : "✗"}`).join("\n") || "No recent sessions.";
  const exams = ctx.upcomingExams.length ? ctx.upcomingExams.map(e => `- ${e.title} on ${e.date}${e.time ? ` at ${e.time}` : ""}${e.subjectName ? ` (${e.subjectName})` : ""}`).join("\n") : "No upcoming exams.";
  const todaySess = ctx.todaySessions.length ? ctx.todaySessions.map(s => `- ${s.subjectName} ${s.startTime}-${s.endTime} (${s.status})`).join("\n") : "No sessions planned for today.";
  const activePlan = ctx.activePlan ? `${ctx.activePlan.title} (${ctx.activePlan.sessions.length} sessions)` : "No active plan.";
  const weeklyProg = ctx.weeklyProgress.length ? ctx.weeklyProgress.map(w => `- ${w.subjectName}: ${w.hoursDone.toFixed(1)}h / ${w.targetHours}h`).join("\n") : "No subjects with targets.";

  return `You are a helpful, encouraging AI study assistant for a student using the Study Focus AI platform.

User context (real data from their account):
Subjects:
${subjList}

Recent sessions:
${recent}

Upcoming exams:
${exams}

Today's schedule:
${todaySess}

Active plan:
${activePlan}

Weekly progress:
${weeklyProg}

Current streak: ${ctx.streak} days
Total focus hours: ${(ctx.totalHours / 60).toFixed(1)}h
Daily goal: ${ctx.dailyGoalHours} hours

Instructions:
- Answer in a friendly, concise, student-appropriate tone.
- Base your advice on the user's actual subjects, sessions, streak, and goals.
- Do not invent subjects or data the user hasn't shared.
- If asked to create a routine, suggest a realistic plan using their subjects/priorities.
- If you lack info, say so and ask a clarifying question.
- Keep answers short and actionable. Use bullet points.
- You can propose actions (reschedule, create goals, etc.) but require user confirmation before executing.
- When proposing schedule changes, be specific about what would change.
- If the user asks you to perform an action, respond with a JSON object containing "reply" and "actions" fields.
- Actions must have: type, payload, description, requiresConfirmation.
- Valid action types: create_plan, reschedule_sessions, update_goals, modify_sessions, replace_plan.
`;
}

// ============================================================================
// Fallback Response (Rule-based)
// ============================================================================

function fallbackResponse(message: string, ctx: AssistantRequest["context"]): string {
  const m = message.toLowerCase();
  const topSubject = ctx.subjects.length ? ctx.subjects[0].name : "your subjects";
  const nextExam = ctx.upcomingExams[0] ? `${ctx.upcomingExams[0].title} on ${ctx.upcomingExams[0].date}` : "no upcoming exams";

  if (m.includes("what should i study") || m.includes("what to study")) {
    return `Based on your subjects and upcoming exams, I'd recommend focusing on **${topSubject}** today. ${ctx.upcomingExams.length ? `Your next exam is ${nextExam}.` : ""} Would you like me to create a study routine for today?`;
  }
  if (m.includes("routine") || m.includes("schedule") || m.includes("plan")) {
    return `I can help you create a study routine! You have ${ctx.subjects.length} subject(s) and ${ctx.activePlan ? "an active plan" : "no active plan"}. To give you a personalized schedule, I'd need to know your preferred study hours and days. Would you like me to guide you to the AI Planner?`;
  }
  if (m.includes("exam") || m.includes("test")) {
    return `Your next exam: **${nextExam}**. ${ctx.upcomingExams.length > 1 ? `You also have ${ctx.upcomingExams.length - 1} more exam(s) coming up.` : ""} Focus your study sessions on the relevant subjects.`;
  }
  if (m.includes("prioritize") || m.includes("priority") || m.includes("focus on")) {
    return `Your highest priority subject is **${topSubject}** (priority ${ctx.subjects[0]?.priority || "N/A"}). ${ctx.upcomingExams.length ? `Given your upcoming ${nextExam}, that subject needs extra attention.` : ""}`;
  }
  if (m.includes("behind") || m.includes("catch up") || m.includes("missed")) {
    const missed = ctx.recentSessions.filter(s => !s.completed).length;
    return `You've missed ${missed} recent session(s). Don't worry — consistency matters more than perfection. Consider adding a review session this week to catch up. Your current streak is ${ctx.streak} days.`;
  }
  if (m.includes("how much") || m.includes("progress") || m.includes("studied")) {
    return `This week you've studied ${(ctx.totalHours / 60).toFixed(1)} hours total. Your daily goal is ${ctx.dailyGoalHours} hours. ${ctx.weeklyProgress.length ? `Progress: ${ctx.weeklyProgress.map(w => `${w.subjectName} ${w.hoursDone.toFixed(1)}h/${w.targetHours}h`).join(", ")}` : "No weekly targets set."}`;
  }
  if (m.includes("streak")) {
    return `Your current study streak is **${ctx.streak} days**! ${ctx.streak > 0 ? "Keep it up!" : "Start a session today to begin your streak."}`;
  }
  if (m.includes("help") || m.includes("what can you do")) {
    return `I can help you with:
- What to study today based on your exams and goals
- Understanding your progress and streak
- Which subjects need attention
- Creating study routines (via the AI Planner)
- Explaining your weekly progress

Just ask me naturally!`;
  }

  return `I'm here to help with your studies! You can ask me things like:
- "What should I study today?"
- "How am I doing this week?"
- "Which subject needs more attention?"
- "I have an exam coming up, help me prepare."

What would you like to know?`;
}

// ============================================================================
// Parse AI Response for Actions
// ============================================================================

function parseAssistantResponse(text: string): { reply: string; actions?: AssistantAction[] } {
  try {
    const parsed = JSON.parse(text);
    if (parsed.reply && typeof parsed.reply === "string") {
      return {
        reply: parsed.reply,
        actions: Array.isArray(parsed.actions) ? parsed.actions : undefined,
      };
    }
  } catch {
    // Not JSON, treat as plain text
  }
  return { reply: text };
}

// ============================================================================
// Main Handler
// ============================================================================

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  // Verify authentication FIRST - derive userId from JWT
  const auth = await verifyAuth(req);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: corsHeaders });
  }
  const userId = auth.userId;

  let body: AssistantRequest;
  try {
    body = (await req.json()) as AssistantRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers: corsHeaders });
  }

  const { message, conversationId, context } = body;
  if (!message || !conversationId) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
  }

  const systemPrompt = buildSystemPrompt(context);

  // Try AI generation
  const aiResponse = await callAI<string>({
    feature: "assistant",
    userId,
    systemPrompt,
    userPrompt: message,
    temperature: 0.5,
    maxTokens: 1500,
    responseFormat: "text",
  });

  // Log usage with verified userId
  await logUsage({
    feature: "assistant",
    userId,
    model: aiResponse.model || Deno.env.get("AI_MODEL") || "unknown",
    status: aiResponse.success ? "success" : "error",
    latencyMs: aiResponse.latencyMs,
    promptTokens: aiResponse.usage?.promptTokens,
    completionTokens: aiResponse.usage?.completionTokens,
    totalTokens: aiResponse.usage?.totalTokens,
    estimatedCostUsd: aiResponse.estimatedCostUsd,
    errorMessage: aiResponse.error,
    conversationId,
  });

  if (aiResponse.success && aiResponse.data) {
    const { reply, actions } = parseAssistantResponse(aiResponse.data);
    return new Response(JSON.stringify({
      reply,
      source: "ai",
      model: aiResponse.model,
      usage: aiResponse.usage,
      latencyMs: aiResponse.latencyMs,
      estimatedCostUsd: aiResponse.estimatedCostUsd,
      actions,
    }), { status: 200, headers: corsHeaders });
  }

  // Fallback
  console.log(`[AI Assistant] AI failed: ${aiResponse.error}. Using fallback.`);
  return new Response(JSON.stringify({
    reply: fallbackResponse(message, context),
    source: "fallback",
  }), { status: 200, headers: { ...corsHeaders, "x-assistant-source": "fallback" } });
}
