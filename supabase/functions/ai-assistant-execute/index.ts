/**
 * Study Focus AI — AI Assistant Action Execution
 *
 * Server-side execution of confirmed AI assistant actions.
 * All operations verify JWT, validate payloads, and enforce ownership.
 */

import { verifyAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface ExecuteRequest {
  action: {
    type: "create_plan" | "reschedule_sessions" | "update_goals" | "modify_sessions" | "replace_plan";
    payload: Record<string, unknown>;
    description: string;
    requiresConfirmation: boolean;
  };
  conversationId: string;
  confirmed: boolean;
}

interface ExecuteResponse {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Supabase Client (service role for database operations)
// ============================================================================

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateUUID(id: unknown, fieldName: string): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }
  return id;
}

function validateString(value: unknown, fieldName: string, required = true, minLength = 1): string {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required`);
    return "";
  }
  if (typeof value !== "string") throw new Error(`${fieldName} must be a string`);
  if (value.length < minLength) throw new Error(`${fieldName} must be at least ${minLength} characters`);
  return value;
}

function validateNumber(value: unknown, fieldName: string, required = true, min?: number, max?: number): number {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required`);
    return 0;
  }
  const num = Number(value);
  if (isNaN(num)) throw new Error(`${fieldName} must be a number`);
  if (min !== undefined && num < min) throw new Error(`${fieldName} must be at least ${min}`);
  if (max !== undefined && num > max) throw new Error(`${fieldName} must be at most ${max}`);
  return num;
}

function validateArray<T>(value: unknown, fieldName: string, itemValidator: (item: unknown, index: number) => T, required = true): T[] {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required`);
    return [];
  }
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);
  return value.map((item, index) => itemValidator(item, index));
}

// ============================================================================
// Action Executors
// ============================================================================

async function executeCreatePlan(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const title = validateString(payload.title, "title", true, 1);
  const subjects = validateArray(payload.subjects, "subjects", (s) => ({
    id: validateUUID(s.id, "subject.id"),
    name: validateString(s.name, "subject.name"),
    priority: validateNumber(s.priority, "subject.priority", true, 1, 5),
    weeklyTargetHours: validateNumber(s.weeklyTargetHours, "subject.weeklyTargetHours", true, 0),
    color: validateString(s.color, "subject.color"),
    difficulty: s.difficulty ? validateNumber(s.difficulty, "subject.difficulty", false, 1, 5) : 3,
  }), true);
  const availableDays = validateArray(payload.availableDays, "availableDays", (d) => validateNumber(d, "day", true, 0, 6), true);
  const preferredStartTime = validateString(payload.preferredStartTime, "preferredStartTime", true);
  const dailyDurationMinutes = validateNumber(payload.dailyDurationMinutes, "dailyDurationMinutes", true, 15, 720);
  const examDates = validateArray(payload.examDates || [], "examDates", (e) => ({
    date: validateString(e.date, "exam.date", true),
    subjectId: e.subjectId ? validateUUID(e.subjectId, "exam.subjectId") : null,
    title: validateString(e.title, "exam.title", true),
    time: e.time ? validateString(e.time, "exam.time") : undefined,
  }), false);
  const goals = validateString(payload.goals, "goals");
  const timezone = validateString(payload.timezone, "timezone", true);
  const sessionDurationMinutes = validateNumber(payload.sessionDurationMinutes, "sessionDurationMinutes", false, 15, 120) || 25;
  const breakDurationMinutes = validateNumber(payload.breakDurationMinutes, "breakDurationMinutes", false, 1, 60) || 5;
  const longBreakDurationMinutes = validateNumber(payload.longBreakDurationMinutes, "longBreakDurationMinutes", false, 5, 120) || 15;
  const sessionsBeforeLongBreak = validateNumber(payload.sessionsBeforeLongBreak, "sessionsBeforeLongBreak", false, 1, 10) || 4;

  // Call the ai-planner function internally
  const plannerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-planner`;
  const plannerResponse = await fetch(plannerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    },
    body: JSON.stringify({
      subjects,
      availableDays,
      preferredStartTime,
      dailyDurationMinutes,
      examDates,
      goals,
      timezone,
      userId,
      sessionDurationMinutes,
      breakDurationMinutes,
      longBreakDurationMinutes,
      sessionsBeforeLongBreak,
    }),
  });

  if (!plannerResponse.ok) {
    const error = await plannerResponse.json();
    throw new Error(`Planner failed: ${error.error || "Unknown error"}`);
  }

  const planResult = await plannerResponse.json();

  if (!planResult.sessions || planResult.sessions.length === 0) {
    throw new Error("Generated plan has no sessions");
  }

  // Save the plan to database
  const { data: plan, error: planError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      title,
      plan_date: new Date().toISOString().split("T")[0],
      source: planResult.source || "ai",
      ai_model: planResult.model,
      notes: planResult.notes,
      is_active: false,
    })
    .select()
    .single();

  if (planError) throw new Error(`Failed to save plan: ${planError.message}`);

  // Save sessions
  const sessionsToInsert = planResult.sessions.map((s: any, idx: number) => ({
    plan_id: plan.id,
    user_id: userId,
    subject_id: s.subjectId,
    subject_name: s.subjectName,
    day_of_week: s.dayOfWeek,
    start_time: s.startTime,
    end_time: s.endTime,
    duration_minutes: s.durationMinutes,
    break_after: s.breakAfter,
    order_index: idx,
    topic: s.topic,
    session_type: s.sessionType || "focus",
    is_flexible: s.isFlexible || false,
    status: "planned",
  }));

  const { error: sessionsError } = await supabase
    .from("planned_sessions")
    .insert(sessionsToInsert);

  if (sessionsError) throw new Error(`Failed to save sessions: ${sessionsError.message}`);

  return { planId: plan.id, title: plan.title, sessionCount: sessionsToInsert.length, source: planResult.source };
}

async function executeRescheduleSessions(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const sessionIds = validateArray(payload.sessionIds, "sessionIds", (id) => validateUUID(id, "sessionId"), true);
  const newDayOfWeek = payload.newDayOfWeek !== undefined ? validateNumber(payload.newDayOfWeek, "newDayOfWeek", false, 0, 6) : null;
  const newStartTime = payload.newStartTime ? validateString(payload.newStartTime, "newStartTime", false) : null;
  const newEndTime = payload.newEndTime ? validateString(payload.newEndTime, "newEndTime", false) : null;

  if (newDayOfWeek === null && !newStartTime && !newEndTime) {
    throw new Error("At least one of newDayOfWeek, newStartTime, or newEndTime must be provided");
  }

  // Verify ownership of all sessions
  const { data: sessions, error: fetchError } = await supabase
    .from("planned_sessions")
    .select("id, plan_id, day_of_week, start_time, end_time, duration_minutes")
    .in("id", sessionIds)
    .eq("user_id", userId);

  if (fetchError) throw new Error(`Failed to fetch sessions: ${fetchError.message}`);
  if (!sessions || sessions.length !== sessionIds.length) {
    throw new Error("One or more sessions not found or access denied");
  }

  // Verify all sessions belong to the same plan
  const planIds = new Set(sessions.map((s) => s.plan_id));
  if (planIds.size > 1) {
    throw new Error("Cannot reschedule sessions from different plans at once");
  }

  // Build updates
  const updates = sessions.map((session) => ({
    id: session.id,
    day_of_week: newDayOfWeek ?? session.day_of_week,
    start_time: newStartTime ?? session.start_time,
    end_time: newEndTime ?? session.end_time,
    duration_minutes: newStartTime && newEndTime
      ? (() => {
          const [sh, sm] = newStartTime.split(":").map(Number);
          const [eh, em] = newEndTime.split(":").map(Number);
          return (eh * 60 + em) - (sh * 60 + sm);
        })()
      : session.duration_minutes,
  }));

  // Update each session
  for (const update of updates) {
    const { error } = await supabase
      .from("planned_sessions")
      .update({
        day_of_week: update.day_of_week,
        start_time: update.start_time,
        end_time: update.end_time,
        duration_minutes: update.duration_minutes,
      })
      .eq("id", update.id)
      .eq("user_id", userId);

    if (error) throw new Error(`Failed to update session ${update.id}: ${error.message}`);
  }

  return { rescheduledCount: updates.length };
}

async function executeUpdateGoals(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const dailyGoalHours = payload.dailyGoalHours !== undefined
    ? validateNumber(payload.dailyGoalHours, "dailyGoalHours", false, 0, 12)
    : null;
  const subjectGoals = validateArray(payload.subjectGoals || [], "subjectGoals", (g) => ({
    subjectId: validateUUID(g.subjectId, "subjectId"),
    weeklyTargetHours: validateNumber(g.weeklyTargetHours, "weeklyTargetHours", true, 0, 100),
  }), false);

  const results = [];

  if (dailyGoalHours !== null) {
    const { error } = await supabase
      .from("profiles")
      .update({ daily_goal_hours: dailyGoalHours })
      .eq("id", userId);
    if (error) throw new Error(`Failed to update daily goal: ${error.message}`);
    results.push({ type: "daily_goal", value: dailyGoalHours });
  }

  for (const goal of subjectGoals) {
    // Verify subject ownership
    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select("id")
      .eq("id", goal.subjectId)
      .eq("user_id", userId)
      .single();

    if (subjectError || !subject) {
      throw new Error(`Subject ${goal.subjectId} not found or access denied`);
    }

    const { error } = await supabase
      .from("subjects")
      .update({ weekly_target_hours: goal.weeklyTargetHours })
      .eq("id", goal.subjectId)
      .eq("user_id", userId);

    if (error) throw new Error(`Failed to update goal for subject ${goal.subjectId}: ${error.message}`);
    results.push({ type: "subject_goal", subjectId: goal.subjectId, weeklyTargetHours: goal.weeklyTargetHours });
  }

  return { updated: results };
}

async function executeModifySessions(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const modifications = validateArray(payload.modifications, "modifications", (m) => ({
    sessionId: validateUUID(m.sessionId, "sessionId"),
    subjectId: m.subjectId ? validateUUID(m.subjectId, "subjectId") : null,
    topic: m.topic !== undefined ? validateString(m.topic, "topic", false) : undefined,
    sessionType: m.sessionType !== undefined ? validateString(m.sessionType, "sessionType", false, 1) : undefined,
    isFlexible: m.isFlexible !== undefined ? Boolean(m.isFlexible) : undefined,
    status: m.status !== undefined ? validateString(m.status, "status", false, 1) : undefined,
  }), true);

  const validSessionTypes = ["focus", "break", "review", "exam_prep"];
  const validStatuses = ["planned", "completed", "skipped", "missed"];

  for (const mod of modifications) {
    if (mod.sessionType && !validSessionTypes.includes(mod.sessionType)) {
      throw new Error(`Invalid sessionType: ${mod.sessionType}. Must be one of: ${validSessionTypes.join(", ")}`);
    }
    if (mod.status && !validStatuses.includes(mod.status)) {
      throw new Error(`Invalid status: ${mod.status}. Must be one of: ${validStatuses.join(", ")}`);
    }

    // Verify ownership
    const { data: session, error: fetchError } = await supabase
      .from("planned_sessions")
      .select("id, subject_id")
      .eq("id", mod.sessionId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !session) {
      throw new Error(`Session ${mod.sessionId} not found or access denied`);
    }

    // Verify new subject ownership if changing
    if (mod.subjectId) {
      const { data: subject, error: subjectError } = await supabase
        .from("subjects")
        .select("id")
        .eq("id", mod.subjectId)
        .eq("user_id", userId)
        .single();
      if (subjectError || !subject) {
        throw new Error(`Subject ${mod.subjectId} not found or access denied`);
      }
    }

    // Build update object
    const updateData: Record<string, any> = {};
    if (mod.subjectId !== undefined) updateData.subject_id = mod.subjectId;
    if (mod.topic !== undefined) updateData.topic = mod.topic;
    if (mod.sessionType !== undefined) updateData.session_type = mod.sessionType;
    if (mod.isFlexible !== undefined) updateData.is_flexible = mod.isFlexible;
    if (mod.status !== undefined) updateData.status = mod.status;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase
        .from("planned_sessions")
        .update(updateData)
        .eq("id", mod.sessionId)
        .eq("user_id", userId);

      if (error) throw new Error(`Failed to modify session ${mod.sessionId}: ${error.message}`);
    }
  }

  return { modifiedCount: modifications.length };
}

async function executeReplacePlan(supabase: ReturnType<typeof createClient>, userId: string, payload: Record<string, unknown>) {
  const oldPlanId = validateUUID(payload.oldPlanId, "oldPlanId");

  // Verify old plan exists and belongs to user
  const { data: oldPlan, error: oldPlanError } = await supabase
    .from("study_plans")
    .select("id, is_active")
    .eq("id", oldPlanId)
    .eq("user_id", userId)
    .single();

  if (oldPlanError || !oldPlan) {
    throw new Error("Current active plan not found or access denied");
  }

  // Generate new plan using the planner
  const newPlanPayload = payload.newPlan;
  if (!newPlanPayload) {
    throw new Error("newPlan payload is required");
  }

  const title = validateString(newPlanPayload.title, "title", true, 1);
  const subjects = validateArray(newPlanPayload.subjects, "subjects", (s) => ({
    id: validateUUID(s.id, "subject.id"),
    name: validateString(s.name, "subject.name"),
    priority: validateNumber(s.priority, "subject.priority", true, 1, 5),
    weeklyTargetHours: validateNumber(s.weeklyTargetHours, "subject.weeklyTargetHours", true, 0),
    color: validateString(s.color, "subject.color"),
    difficulty: s.difficulty ? validateNumber(s.difficulty, "subject.difficulty", false, 1, 5) : 3,
  }), true);
  const availableDays = validateArray(newPlanPayload.availableDays, "availableDays", (d) => validateNumber(d, "day", true, 0, 6), true);
  const preferredStartTime = validateString(newPlanPayload.preferredStartTime, "preferredStartTime", true);
  const dailyDurationMinutes = validateNumber(newPlanPayload.dailyDurationMinutes, "dailyDurationMinutes", true, 15, 720);
  const examDates = validateArray(newPlanPayload.examDates || [], "examDates", (e) => ({
    date: validateString(e.date, "exam.date", true),
    subjectId: e.subjectId ? validateUUID(e.subjectId, "exam.subjectId") : null,
    title: validateString(e.title, "exam.title", true),
    time: e.time ? validateString(e.time, "exam.time") : undefined,
  }), false);
  const goals = validateString(newPlanPayload.goals, "goals");
  const timezone = validateString(newPlanPayload.timezone, "timezone", true);
  const sessionDurationMinutes = validateNumber(newPlanPayload.sessionDurationMinutes, "sessionDurationMinutes", false, 15, 120) || 25;
  const breakDurationMinutes = validateNumber(newPlanPayload.breakDurationMinutes, "breakDurationMinutes", false, 1, 60) || 5;
  const longBreakDurationMinutes = validateNumber(newPlanPayload.longBreakDurationMinutes, "longBreakDurationMinutes", false, 5, 120) || 15;
  const sessionsBeforeLongBreak = validateNumber(newPlanPayload.sessionsBeforeLongBreak, "sessionsBeforeLongBreak", false, 1, 10) || 4;

  // Call planner
  const plannerUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-planner`;
  const plannerResponse = await fetch(plannerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    },
    body: JSON.stringify({
      subjects,
      availableDays,
      preferredStartTime,
      dailyDurationMinutes,
      examDates,
      goals,
      timezone,
      userId,
      sessionDurationMinutes,
      breakDurationMinutes,
      longBreakDurationMinutes,
      sessionsBeforeLongBreak,
    }),
  });

  if (!plannerResponse.ok) {
    const error = await plannerResponse.json();
    throw new Error(`Planner failed: ${error.error || "Unknown error"}`);
  }

  const planResult = await plannerResponse.json();

  if (!planResult.sessions || planResult.sessions.length === 0) {
    throw new Error("Generated replacement plan has no sessions");
  }

  // Step 1: Create new plan
  const { data: newPlan, error: newPlanError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      title,
      plan_date: new Date().toISOString().split("T")[0],
      source: planResult.source || "ai",
      ai_model: planResult.model,
      notes: planResult.notes,
      is_active: true,
      parent_plan_id: oldPlanId,
      version: 1,
    })
    .select()
    .single();

  if (newPlanError) throw new Error(`Failed to create replacement plan: ${newPlanError.message}`);

  // Step 2: Save new sessions
  const sessionsToInsert = planResult.sessions.map((s: any, idx: number) => ({
    plan_id: newPlan.id,
    user_id: userId,
    subject_id: s.subjectId,
    subject_name: s.subjectName,
    day_of_week: s.dayOfWeek,
    start_time: s.startTime,
    end_time: s.endTime,
    duration_minutes: s.durationMinutes,
    break_after: s.breakAfter,
    order_index: idx,
    topic: s.topic,
    session_type: s.sessionType || "focus",
    is_flexible: s.isFlexible || false,
    status: "planned",
  }));

  const { error: sessionsError } = await supabase
    .from("planned_sessions")
    .insert(sessionsToInsert);

  if (sessionsError) throw new Error(`Failed to save replacement sessions: ${sessionsError.message}`);

  // Step 3: Deactivate old plan
  const { error: deactivateError } = await supabase
    .from("study_plans")
    .update({ is_active: false })
    .eq("id", oldPlanId)
    .eq("user_id", userId);

  if (deactivateError) throw new Error(`Failed to deactivate old plan: ${deactivateError.message}`);

  return {
    oldPlanId,
    newPlanId: newPlan.id,
    title: newPlan.title,
    sessionCount: sessionsToInsert.length,
    source: planResult.source,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

interface ExecuteRequest {
  action: {
    type: "create_plan" | "reschedule_sessions" | "update_goals" | "modify_sessions" | "replace_plan";
    payload: Record<string, unknown>;
    description: string;
    requiresConfirmation: boolean;
  };
  conversationId: string;
  confirmed: boolean;
}

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

  // Verify authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: corsHeaders });
  }
  const userId = auth.userId;

  let body: { action: any; conversationId: string; confirmed: boolean };
  try {
    body = (await req.json()) as any;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers: corsHeaders });
  }

  const { action, conversationId, confirmed } = body;

  if (!action || !action.type) {
    return new Response(JSON.stringify({ error: "Missing action" }), { status: 400, headers: corsHeaders });
  }

  if (!confirmed) {
    return new Response(JSON.stringify({ error: "Action not confirmed by user" }), { status: 400, headers: corsHeaders });
  }

  if (action.requiresConfirmation !== true) {
    return new Response(JSON.stringify({ error: "Action does not require confirmation" }), { status: 400, headers: corsHeaders });
  }

  const supabase = getSupabaseClient();

  try {
    let result: any;

    switch (action.type) {
      case "create_plan":
        result = await executeCreatePlan(supabase, userId, action.payload);
        break;
      case "reschedule_sessions":
        result = await executeRescheduleSessions(supabase, userId, action.payload);
        break;
      case "update_goals":
        result = await executeUpdateGoals(supabase, userId, action.payload);
        break;
      case "modify_sessions":
        result = await executeModifySessions(supabase, userId, action.payload);
        break;
      case "replace_plan":
        result = await executeReplacePlan(supabase, userId, action.payload);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown action type: ${action.type}` }), { status: 400, headers: corsHeaders });
    }

    // Log the executed action for audit trail
    await supabase
      .from("ai_assistant_actions")
      .insert({
        user_id: userId,
        conversation_id: conversationId || null,
        action_type: action.type,
        action_payload: action.payload,
        status: "executed",
        result,
        executed_at: new Date().toISOString(),
      });

    return new Response(JSON.stringify({
      success: true,
      message: `${action.type} executed successfully`,
      data: result,
    }), { status: 200, headers: corsHeaders });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[AI Assistant Execute] ${action.type} failed:`, error);

    // Log failed action
    await supabase
      .from("ai_assistant_actions")
      .insert({
        user_id: userId,
        conversation_id: conversationId || null,
        action_type: action.type,
        action_payload: action.payload,
        status: "failed",
        result: { error: errorMessage },
        executed_at: new Date().toISOString(),
      });

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), { status: 400, headers: corsHeaders });
  }
}
