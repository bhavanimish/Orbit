// schemas.ts – Zod schemas for Firestore data models
import { z } from "zod";

// ==========================================
// 1. User Schema (document ID is the auth uid)
// ==========================================
export const UserSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  email: z.string().email().max(256),
  displayName: z.string().max(100).optional(),
  createdAt: z.string().datetime().or(z.number()),
  updatedAt: z.string().datetime().or(z.number()),
});
export type User = z.infer<typeof UserSchema>;

// ==========================================
// 2. Goal Schema
// ==========================================
export const GoalStatusSchema = z.enum(["active", "completed", "archived"]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: GoalStatusSchema,
  // deadline field removed per request – keep targetDate only
  targetDate: z.string().max(64).optional(),
  constraints: z.array(z.string().max(300)).max(20).optional(),
  preferredSchedule: z.string().max(500).optional(),
  createdAt: z.string().datetime().or(z.number()),
  updatedAt: z.string().datetime().or(z.number()),
});
export type Goal = z.infer<typeof GoalSchema>;

// ==========================================
// 3. Plan Schema
// ==========================================
export const PlanStatusSchema = z.enum([
  "proposed",
  "approved",
  "rejected",
  "superseded",
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const ProviderModeSchema = z.enum(["openai", "mock"]);
export type ProviderMode = z.infer<typeof ProviderModeSchema>;

export const PlanTaskItemSchema = z.object({
  id: z.string().max(64).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
  dayOffset: z.number().int().min(0).max(365).optional(),
  order: z.number().int().min(0).max(1000),
  priority: z.enum(["low", "medium", "high"]),
});
export type PlanTaskItem = z.infer<typeof PlanTaskItemSchema>;

export const PlanSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  goalId: z.string().min(1).max(128),
  version: z.number().int().min(1),
  status: PlanStatusSchema,
  providerMode: ProviderModeSchema,
  summary: z.string().max(2000),
  tasks: z.array(PlanTaskItemSchema).max(100),
  createdAt: z.string().datetime().or(z.number()),
  updatedAt: z.string().datetime().or(z.number()),
});
export type Plan = z.infer<typeof PlanSchema>;

// ==========================================
// 4. Task Schema
// ==========================================
export const TaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(["low", "medium", "high"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  goalId: z.string().min(1).max(128),
  planId: z.string().max(128).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  order: z.number().int().min(0).max(10000),
  dueAt: z.string().datetime().or(z.number()).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
  completedAt: z.string().datetime().or(z.number()).optional(),
  createdAt: z.string().datetime().or(z.number()),
  updatedAt: z.string().datetime().or(z.number()),
});
export type Task = z.infer<typeof TaskSchema>;

// ==========================================
// 5. Agent Action Schema
// ==========================================
export const ActionTypeSchema = z.enum([
  "CREATE_TASK",
  "COMPLETE_TASK",
  "RESCHEDULE_TASK",
  "CANCEL_TASK",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "auto_approved",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ExecutionStatusSchema = z.enum([
  "pending",
  "executing",
  "success",
  "failed",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const AgentActionSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  planId: z.string().max(128).optional(),
  actionType: ActionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  approvalStatus: ApprovalStatusSchema,
  executionStatus: ExecutionStatusSchema,
  idempotencyKey: z.string().min(1).max(128),
  executionResult: z.string().max(2000).optional(),
  createdAt: z.string().datetime().or(z.number()),
  updatedAt: z.string().datetime().or(z.number()),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

// ==========================================
// 6. Activity Log Schema
// ==========================================
export const ActivityLogSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  actionType: z.string().min(1).max(100),
  entityType: z.enum(["goal", "plan", "task", "agentAction", "auth"]),
  entityId: z.string().max(128).optional(),
  summary: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime().or(z.number()),
});
export type ActivityLog = z.infer<typeof ActivityLogSchema>;
