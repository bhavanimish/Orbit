// planner.ts - Plan generation orchestration and Firestore persistence
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { AIProvider } from "./aiProvider";
import { MockProvider } from "./mockProvider";
import { OpenAIProvider } from "./openaiProvider";
import {
  GeneratePlanInput,
  GeneratePlanInputSchema,
  GeneratedPlan,
  Plan,
} from "./schemas";

/**
 * Returns the configured AIProvider based on AI_PROVIDER env var.
 * @return {AIProvider} Instantiated AI provider.
 */
export function getAIProvider(): AIProvider {
  const providerType = (process.env.AI_PROVIDER || "mock").toLowerCase();
  if (providerType === "openai") {
    return new OpenAIProvider();
  }
  return new MockProvider();
}

export interface GeneratePlanOptions {
  provider?: AIProvider;
  firestore?: Firestore;
}

/**
 * Removes undefined values (Firestore refuses to store them).
 * Only use on plain data (strings, numbers, arrays, objects).
 * @param {T} value Plain data.
 * @return {T} A copy without undefined properties.
 */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Orchestrates plan generation, validation, versioning, and persistence.
 * @param {unknown} rawInput Client input payload.
 * @param {string} callerUid Authenticated caller UID.
 * @param {GeneratePlanOptions} [options] Provider/db overrides for testing.
 * @return {Promise<{planId: string, plan: Plan}>} Resulting plan document.
 */
export async function executeGeneratePlan(
  rawInput: unknown,
  callerUid: string,
  options?: GeneratePlanOptions,
): Promise<{ planId: string; plan: Plan }> {
  if (!callerUid) {
    throw new Error("Authentication required.");
  }

  // 1. Validate Input
  const parsedInput: GeneratePlanInput =
    GeneratePlanInputSchema.parse(rawInput);
  const { goalId, constraints: inputConstraints } = parsedInput;

  const db = options?.firestore || getFirestore();

  // 2. Fetch Goal & Verify Ownership
  const goalRef = db.collection("goals").doc(goalId);
  const goalSnap = await goalRef.get();

  if (!goalSnap.exists) {
    throw new Error("Goal not found.");
  }

  const goalData = goalSnap.data();
  if (!goalData || goalData.ownerUid !== callerUid) {
    throw new Error("Goal does not belong to caller.");
  }

  if (goalData.status === "archived") {
    throw new Error("Cannot generate plan for an archived goal.");
  }

  // Combine goal constraints and request constraints
  const combinedConstraints = [
    ...(Array.isArray(goalData.constraints) ? goalData.constraints : []),
    ...(Array.isArray(inputConstraints) ? inputConstraints : []),
  ];

  // 3. Obtain AI Provider & Generate Plan
  const provider = options?.provider || getAIProvider();
  const generated: GeneratedPlan = await provider.generatePlan({
    goalTitle: goalData.title,
    goalDescription: goalData.description,
    targetDate: goalData.targetDate,
    constraints: combinedConstraints,
    preferredSchedule: goalData.preferredSchedule,
  });

  // 4. Calculate Version
  const existingPlansSnap = await db
    .collection("plans")
    .where("goalId", "==", goalId)
    .where("ownerUid", "==", callerUid)
    .get();

  let maxVersion = 0;
  existingPlansSnap.forEach((doc) => {
    const p = doc.data();
    if (typeof p.version === "number" && p.version > maxVersion) {
      maxVersion = p.version;
    }
  });

  const newVersion = maxVersion + 1;
  const now = FieldValue.serverTimestamp();

  // 5. Structure Stored Plan (undefined values are removed first)
  const cleanTasks = stripUndefined(
    generated.tasks.map((t, idx) => ({
      order: t.order ?? idx + 1,
      title: t.title,
      description: t.description || "",
      priority: t.priority,
      dueAt: t.dueAt,
      estimatedDurationMinutes: t.estimatedDurationMinutes,
      dependencies: t.dependencies,
    })),
  );
  const cleanMilestones = stripUndefined(generated.milestones ?? []);

  const planData: Record<string, unknown> = {
    ownerUid: callerUid,
    goalId,
    version: newVersion,
    status: "proposed",
    providerMode: provider.mode,
    summary: generated.summary,
    milestones: cleanMilestones,
    tasks: cleanTasks,
    createdAt: now,
    updatedAt: now,
  };

  // 6. Write Plan and ActivityLog atomically
  const planRef = db.collection("plans").doc();
  const logRef = db.collection("activityLogs").doc();

  const batch = db.batch();
  batch.set(planRef, planData);
  batch.set(logRef, {
    ownerUid: callerUid,
    actionType: "GENERATE_PLAN",
    entityType: "plan",
    entityId: planRef.id,
    summary:
      `Orbit generated a proposed plan (v${newVersion}) via ${provider.mode}.`,
    metadata: {
      goalId,
      version: newVersion,
      providerMode: provider.mode,
      taskCount: generated.tasks.length,
    },
    createdAt: now,
  });

  await batch.commit();

  return {
    planId: planRef.id,
    plan: {
      ...planData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Plan,
  };
}