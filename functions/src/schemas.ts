// schemas.ts – Zod schemas for Firestore data models and AI planning
import {z} from "zod";

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
  targetDate: z.string().max(64).optional(),
  constraints: z.array(z.string().max(300)).max(20).optional(),
  preferredSchedule: z.string().max(500).optional(),
  createdAt: z.string().datetime().or(z.number()),
  updatedAt: z.string().datetime().or(z.number()),
});
export type Goal = z.infer<typeof GoalSchema>;

// ==========================================
// 3. AI Generated Plan Task & Plan Schemas
// ==========================================
export const PlanTaskPrioritySchema = z.enum(["low", "medium", "high"]);
export type PlanTaskPriority = z.infer<typeof PlanTaskPrioritySchema>;

const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;

export const GeneratedTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: PlanTaskPrioritySchema,
  dueAt: z.string().regex(isoDateRegex, "Invalid ISO date string")
    .refine((val) => {
      const d = new Date(val);
      if (isNaN(d.getTime())) return false;
      const now = Date.now() - 24 * 60 * 60 * 1000;
      const maxFuture = Date.now() + 5 * 365.25 * 24 * 60 * 60 * 1000;
      const t = d.getTime();
      return t >= now && t <= maxFuture;
    }, "dueAt must not be in the past or absurdly far in the future"),
  estimatedDurationMinutes: z.number().int().min(1).max(1440),
  order: z.number().int().min(0).max(1000),
  dependencies: z.array(z.number().int().min(0)).max(20).default([]),
});
export type GeneratedTask = z.infer<typeof GeneratedTaskSchema>;

export const GeneratedPlanSchema = z.object({
  summary: z.string().min(1).max(2000),
  milestones: z.array(z.string().min(1).max(300)).max(20).default([]),
  tasks: z.array(GeneratedTaskSchema).min(1).max(50),
}).superRefine((val, ctx) => {
  const taskCount = val.tasks.length;
  for (let i = 0; i < taskCount; i++) {
    const task = val.tasks[i];
    for (const dep of task.dependencies) {
      if (dep >= taskCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Task index ${i} references invalid dependency ${dep}`,
          path: ["tasks", i, "dependencies"],
        });
      } else if (dep === i) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Task index ${i} cannot depend on itself`,
          path: ["tasks", i, "dependencies"],
        });
      }
    }
  }

  const adj = new Map<number, number[]>();
  for (let i = 0; i < taskCount; i++) {
    adj.set(i, val.tasks[i].dependencies.filter((d) => d < taskCount));
  }

  const visited = new Array(taskCount).fill(0);
  const hasCycle = (u: number): boolean => {
    visited[u] = 1;
    for (const v of adj.get(u) || []) {
      if (visited[v] === 1) return true;
      if (visited[v] === 0 && hasCycle(v)) return true;
    }
    visited[u] = 2;
    return false;
  };

  for (let i = 0; i < taskCount; i++) {
    if (visited[i] === 0) {
      if (hasCycle(i)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Tasks contain cyclic dependencies",
          path: ["tasks"],
        });
        break;
      }
    }
  }
});
export type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;

// ==========================================
// 4. Stored Plan Schema
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
  priority: PlanTaskPrioritySchema,
  dueAt: z.string().optional(),
  dependencies: z.array(z.number().int()).optional(),
});
export type PlanTaskItem = z.infer<typeof PlanTaskItemSchema>;

export const PlanSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  goalId: z.string().min(1).max(128),
  version: z.number().int().min(1),
  status: PlanStatusSchema,
  providerMode: ProviderModeSchema,
  summary: z.string().max(2000),
  milestones: z.array(z.string().max(300)).max(20).optional(),
  tasks: z.array(PlanTaskItemSchema).max(100),
  approvedAt: z.any().optional(),
  rejectedAt: z.any().optional(),
  createdAt: z.string().datetime().or(z.number()),
  updatedAt: z.string().datetime().or(z.number()),
});
export type Plan = z.infer<typeof PlanSchema>;

// ==========================================
// 5. Task Schema
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
  dueAt: z.any().optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
  completedAt: z.any().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});
export type Task = z.infer<typeof TaskSchema>;

// ==========================================
// 6. Action Payloads & Agent Action Schema
// ==========================================
export const ActionTypeSchema = z.enum([
  "CREATE_TASK",
  "COMPLETE_TASK",
  "RESCHEDULE_TASK",
  "CANCEL_TASK",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

const dateOrIso = z.string().datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const CreateTaskPayloadSchema = z.object({
  goalId: z.string().min(1).max(128),
  planId: z.string().max(128).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: TaskPrioritySchema,
  order: z.number().int().min(0).max(10000),
  dueAt: dateOrIso.optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
});
export type CreateTaskPayload = z.infer<typeof CreateTaskPayloadSchema>;

export const CompleteTaskPayloadSchema = z.object({
  taskId: z.string().min(1).max(128),
});
export type CompleteTaskPayload = z.infer<typeof CompleteTaskPayloadSchema>;

export const RescheduleTaskPayloadSchema = z.object({
  taskId: z.string().min(1).max(128),
  dueAt: dateOrIso,
});
export type RescheduleTaskPayload = z.infer<typeof RescheduleTaskPayloadSchema>;

export const CancelTaskPayloadSchema = z.object({
  taskId: z.string().min(1).max(128),
});
export type CancelTaskPayload = z.infer<typeof CancelTaskPayloadSchema>;

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
  createdAt: z.any(),
  updatedAt: z.any(),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

// ==========================================
// 7. Activity Log Schema
// ==========================================
export const ActivityLogSchema = z.object({
  ownerUid: z.string().min(1).max(128),
  actionType: z.string().min(1).max(100),
  entityType: z.enum(["goal", "plan", "task", "agentAction", "auth"]),
  entityId: z.string().max(128).optional(),
  summary: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.any(),
});
export type ActivityLog = z.infer<typeof ActivityLogSchema>;

// ==========================================
// 8. GeneratePlan Input Schema
// ==========================================
export const GeneratePlanInputSchema = z.object({
  goalId: z.string().min(1).max(128),
  constraints: z.array(z.string().min(1).max(300)).max(20).optional(),
});
export type GeneratePlanInput = z.infer<typeof GeneratePlanInputSchema>;

// ==========================================
// 9. Plan Review & Approval Schemas
// ==========================================
export const EditedPlanTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: TaskPrioritySchema,
  dueAt: z.string().optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(1440).optional(),
  order: z.number().int().min(0).max(1000),
});
export type EditedPlanTask = z.infer<typeof EditedPlanTaskSchema>;

export const ApprovePlanInputSchema = z.object({
  planId: z.string().min(1).max(128),
  editedTasks: z.array(EditedPlanTaskSchema).max(100).optional(),
});
export type ApprovePlanInput = z.infer<typeof ApprovePlanInputSchema>;

export const RejectPlanInputSchema = z.object({
  planId: z.string().min(1).max(128),
});
export type RejectPlanInput = z.infer<typeof RejectPlanInputSchema>;

export const ExecuteActionInputSchema = z.object({
  actionType: ActionTypeSchema,
  idempotencyKey: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
});
export type ExecuteActionInput = z.infer<typeof ExecuteActionInputSchema>;
