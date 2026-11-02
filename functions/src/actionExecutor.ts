// actionExecutor.ts - Robust, transactional action executor
import { createHash } from "crypto";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import {
  ApprovePlanInput,
  ApprovePlanInputSchema,
  CancelTaskPayloadSchema,
  CompleteTaskPayloadSchema,
  CreateTaskPayloadSchema,
  EditedPlanTask,
  ExecuteActionInput,
  ExecuteActionInputSchema,
  PlanTaskItem,
  RejectPlanInput,
  RejectPlanInputSchema,
  RescheduleTaskPayloadSchema,
} from "./schemas";

export interface ExecutionOptions {
  firestore?: Firestore;
}

/**
 * Approves a proposed plan atomically and idempotently.
 * Double-approving returns existing approval state without duplicates.
 * @param {unknown} rawInput Client payload with planId and editedTasks.
 * @param {string} callerUid Authenticated caller UID.
 * @param {ExecutionOptions} [options] Firestore override for testing.
 * @return {Promise<{success: boolean, planId: string, taskIds: string[]}>}
 */
export async function executeApprovePlan(
  rawInput: unknown,
  callerUid: string,
  options?: ExecutionOptions,
): Promise<{ success: boolean; planId: string; taskIds: string[] }> {
  if (!callerUid) {
    throw new Error("Authentication required.");
  }

  const parsed: ApprovePlanInput = ApprovePlanInputSchema.parse(rawInput);
  const { planId, editedTasks } = parsed;

  const db = options?.firestore || getFirestore();
  const planRef = db.collection("plans").doc(planId);

  return await db.runTransaction(async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists) {
      throw new Error("Plan not found.");
    }

    const planData = planSnap.data();
    if (!planData || planData.ownerUid !== callerUid) {
      throw new Error("Plan does not belong to caller.");
    }

    // Idempotency check (read inside the transaction)
    if (planData.status === "approved") {
      const existingTasksSnap = await transaction.get(
        db
          .collection("tasks")
          .where("planId", "==", planId)
          .where("ownerUid", "==", callerUid),
      );

      const existingIds: string[] = [];
      existingTasksSnap.forEach((d) => existingIds.push(d.id));

      return {
        success: true,
        planId,
        taskIds: existingIds,
      };
    }

    if (planData.status !== "proposed") {
      throw new Error(
        `Cannot approve plan with status '${planData.status}'. ` +
        "Only 'proposed' plans can be approved.",
      );
    }

    const now = FieldValue.serverTimestamp();
    const tasksToCreate: EditedPlanTask[] = editedTasks ||
      planData.tasks?.map((t: PlanTaskItem, idx: number) => ({
        title: t.title,
        description: t.description || "",
        priority: t.priority || "medium",
        order: t.order ?? idx + 1,
        dueAt: t.dueAt,
        estimatedDurationMinutes: t.estimatedDurationMinutes,
      })) || [];

    const createdTaskIds: string[] = [];

    // Create tasks atomically
    for (const t of tasksToCreate) {
      const taskRef = db.collection("tasks").doc();
      const taskDoc: Record<string, unknown> = {
        ownerUid: callerUid,
        goalId: planData.goalId,
        planId: planId,
        title: t.title,
        status: "todo",
        priority: t.priority,
        order: t.order,
        createdAt: now,
        updatedAt: now,
      };

      if (t.description) taskDoc.description = t.description;
      if (t.estimatedDurationMinutes) {
        taskDoc.estimatedDurationMinutes = t.estimatedDurationMinutes;
      }
      if (t.dueAt) {
        const d = new Date(t.dueAt);
        if (!isNaN(d.getTime())) {
          taskDoc.dueAt = Timestamp.fromDate(d);
        }
      }

      transaction.set(taskRef, taskDoc);
      createdTaskIds.push(taskRef.id);
    }

    // Update plan status to approved
    transaction.update(planRef, {
      status: "approved",
      approvedAt: now,
      updatedAt: now,
    });

    // Write activity log
    const logRef = db.collection("activityLogs").doc();
    const versionNum = planData.version || 1;
    transaction.set(logRef, {
      ownerUid: callerUid,
      actionType: "APPROVE_PLAN",
      entityType: "plan",
      entityId: planId,
      summary:
        `Approved plan (v${versionNum}) and created ` +
        `${createdTaskIds.length} tasks.`,
      metadata: {
        goalId: planData.goalId,
        planId,
        taskCount: createdTaskIds.length,
      },
      createdAt: now,
    });

    return {
      success: true,
      planId,
      taskIds: createdTaskIds,
    };
  });
}

/**
 * Rejects a proposed plan.
 * @param {unknown} rawInput Client payload with planId.
 * @param {string} callerUid Authenticated caller UID.
 * @param {ExecutionOptions} [options] Firestore override for testing.
 * @return {Promise<{success: boolean, planId: string}>}
 */
export async function executeRejectPlan(
  rawInput: unknown,
  callerUid: string,
  options?: ExecutionOptions,
): Promise<{ success: boolean; planId: string }> {
  if (!callerUid) {
    throw new Error("Authentication required.");
  }

  const parsed: RejectPlanInput = RejectPlanInputSchema.parse(rawInput);
  const { planId } = parsed;

  const db = options?.firestore || getFirestore();
  const planRef = db.collection("plans").doc(planId);

  return await db.runTransaction(async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists) {
      throw new Error("Plan not found.");
    }

    const planData = planSnap.data();
    if (!planData || planData.ownerUid !== callerUid) {
      throw new Error("Plan does not belong to caller.");
    }

    if (planData.status === "rejected") {
      return { success: true, planId };
    }

    if (planData.status !== "proposed") {
      throw new Error(
        `Cannot reject plan with status '${planData.status}'. ` +
        "Only 'proposed' plans can be rejected.",
      );
    }

    const now = FieldValue.serverTimestamp();
    transaction.update(planRef, {
      status: "rejected",
      rejectedAt: now,
      updatedAt: now,
    });

    const logRef = db.collection("activityLogs").doc();
    transaction.set(logRef, {
      ownerUid: callerUid,
      actionType: "REJECT_PLAN",
      entityType: "plan",
      entityId: planId,
      summary: `Rejected plan (v${planData.version || 1}).`,
      metadata: {
        goalId: planData.goalId,
        planId,
      },
      createdAt: now,
    });

    return { success: true, planId };
  });
}

/**
 * Builds a safe agentActions document ID that is scoped to the caller.
 * The client key is hashed, so it can never contain path characters and
 * one user can never collide with another user's key.
 * @param {string} callerUid Authenticated caller UID.
 * @param {string} idempotencyKey Client-supplied idempotency key.
 * @return {string} Document ID.
 */
function actionDocId(callerUid: string, idempotencyKey: string): string {
  const hash = createHash("sha256").update(idempotencyKey).digest("hex");
  return `${callerUid}_${hash}`;
}

/**
 * Executes a controlled task action with idempotency, owner verification,
 * and transaction-safe state modification.
 * @param {unknown} rawInput Action type, idempotencyKey, and action payload.
 * @param {string} callerUid Authenticated caller UID.
 * @param {ExecutionOptions} [options] Firestore override for testing.
 * @return {Promise<{success: boolean, result: unknown}>}
 */
export async function executeControlledAction(
  rawInput: unknown,
  callerUid: string,
  options?: ExecutionOptions,
): Promise<{ success: boolean; result: unknown }> {
  if (!callerUid) {
    throw new Error("Authentication required.");
  }

  const parsed: ExecuteActionInput = ExecuteActionInputSchema.parse(rawInput);
  const { actionType, idempotencyKey, payload } = parsed;

  // Validate the payload for the action type (once, before any DB work)
  const createPayload = actionType === "CREATE_TASK" ?
    CreateTaskPayloadSchema.parse(payload) :
    null;
  const completePayload = actionType === "COMPLETE_TASK" ?
    CompleteTaskPayloadSchema.parse(payload) :
    null;
  const reschedulePayload = actionType === "RESCHEDULE_TASK" ?
    RescheduleTaskPayloadSchema.parse(payload) :
    null;
  const cancelPayload = actionType === "CANCEL_TASK" ?
    CancelTaskPayloadSchema.parse(payload) :
    null;

  const targetTaskId =
    completePayload?.taskId ||
    reschedulePayload?.taskId ||
    cancelPayload?.taskId ||
    "";

  let rescheduleDate: Date | null = null;
  if (reschedulePayload) {
    rescheduleDate = new Date(reschedulePayload.dueAt);
    if (isNaN(rescheduleDate.getTime())) {
      throw new Error("Invalid due date format.");
    }
  }

  const db = options?.firestore || getFirestore();
  const actionDocRef = db
    .collection("agentActions")
    .doc(actionDocId(callerUid, idempotencyKey));

  return await db.runTransaction(async (transaction) => {
    // 1. Idempotency check, inside the transaction so that two
    // simultaneous requests with the same key cannot both execute.
    const existingActionSnap = await transaction.get(actionDocRef);
    if (existingActionSnap.exists) {
      const existing = existingActionSnap.data();
      if (existing) {
        let parsedResult: unknown = null;
        try {
          parsedResult = existing.executionResult ?
            JSON.parse(existing.executionResult) :
            null;
        } catch {
          parsedResult = existing.executionResult;
        }
        return {
          success: existing.executionStatus === "success",
          result: parsedResult,
        };
      }
    }

    // 2. Read and verify the target (all reads happen before writes)
    const now = FieldValue.serverTimestamp();
    let executionOutput: Record<string, unknown> = {};

    if (createPayload) {
      const goalRef = db.collection("goals").doc(createPayload.goalId);
      const goalSnap = await transaction.get(goalRef);
      if (!goalSnap.exists || goalSnap.data()?.ownerUid !== callerUid) {
        throw new Error("Goal not found or does not belong to caller.");
      }

      const newTaskRef = db.collection("tasks").doc();
      const newTaskData: Record<string, unknown> = {
        ownerUid: callerUid,
        goalId: createPayload.goalId,
        title: createPayload.title,
        status: "todo",
        priority: createPayload.priority,
        order: createPayload.order,
        createdAt: now,
        updatedAt: now,
      };
      if (createPayload.planId) newTaskData.planId = createPayload.planId;
      if (createPayload.description) {
        newTaskData.description = createPayload.description;
      }
      if (createPayload.estimatedDurationMinutes) {
        newTaskData.estimatedDurationMinutes =
          createPayload.estimatedDurationMinutes;
      }
      if (createPayload.dueAt) {
        const d = new Date(createPayload.dueAt);
        if (!isNaN(d.getTime())) {
          newTaskData.dueAt = Timestamp.fromDate(d);
        }
      }

      transaction.set(newTaskRef, newTaskData);
      executionOutput = { taskId: newTaskRef.id, status: "created" };
    } else {
      const taskRef = db.collection("tasks").doc(targetTaskId);
      const taskSnap = await transaction.get(taskRef);

      if (!taskSnap.exists) {
        throw new Error("Task not found.");
      }

      const taskData = taskSnap.data();
      if (!taskData || taskData.ownerUid !== callerUid) {
        throw new Error("Task does not belong to caller.");
      }

      if (
        taskData.status === "cancelled" &&
        (actionType === "COMPLETE_TASK" || actionType === "RESCHEDULE_TASK")
      ) {
        throw new Error("A cancelled task cannot be changed.");
      }

      if (actionType === "COMPLETE_TASK") {
        transaction.update(taskRef, {
          status: "done",
          completedAt: now,
          updatedAt: now,
        });
        executionOutput = { taskId: targetTaskId, status: "done" };
      } else if (actionType === "RESCHEDULE_TASK" && rescheduleDate) {
        transaction.update(taskRef, {
          dueAt: Timestamp.fromDate(rescheduleDate),
          updatedAt: now,
        });
        executionOutput = {
          taskId: targetTaskId,
          dueAt: reschedulePayload?.dueAt,
        };
      } else if (actionType === "CANCEL_TASK") {
        transaction.update(taskRef, {
          status: "cancelled",
          updatedAt: now,
        });
        executionOutput = { taskId: targetTaskId, status: "cancelled" };
      }
    }

    // 3. Store action record with the scoped idempotency document ID
    transaction.set(actionDocRef, {
      ownerUid: callerUid,
      actionType,
      payload,
      approvalStatus: "approved",
      executionStatus: "success",
      idempotencyKey,
      executionResult: JSON.stringify(executionOutput),
      createdAt: now,
      updatedAt: now,
    });

    // 4. Activity log
    const logRef = db.collection("activityLogs").doc();
    transaction.set(logRef, {
      ownerUid: callerUid,
      actionType,
      entityType: "task",
      entityId: targetTaskId || (executionOutput.taskId as string),
      summary: `Executed ${actionType} action.`,
      metadata: { idempotencyKey, ...executionOutput },
      createdAt: now,
    });

    return {
      success: true,
      result: executionOutput,
    };
  });
}