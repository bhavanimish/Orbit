/**
 * planService.ts
 * Client-side plan generation and approval/rejection.
 * Runs entirely on the Spark (free) plan — no Cloud Functions needed.
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GeneratedTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueAt: string; // YYYY-MM-DD
  estimatedDurationMinutes: number;
  order: number;
  dependencies: number[];
}

export interface GeneratedPlan {
  summary: string;
  milestones: string[];
  tasks: GeneratedTask[];
}

// ── Mock Generator ────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function generateMockPlan(
  goalTitle: string,
  _goalDescription?: string,
): GeneratedPlan {
  const snippet = goalTitle.slice(0, 50);
  return {
    summary: `Structured execution plan for: ${goalTitle.slice(0, 100)}`,
    milestones: [
      "Milestone 1: Research and initial breakdown",
      "Milestone 2: Execution and iteration",
      "Milestone 3: Final validation and completion",
    ],
    tasks: [
      {
        title: `Research and planning for ${snippet}`,
        description: "Establish baseline requirements and constraints.",
        priority: "high",
        dueAt: fmt(addDays(7)),
        estimatedDurationMinutes: 60,
        order: 1,
        dependencies: [],
      },
      {
        title: `Implement primary phase for ${snippet}`,
        description: "Execute core deliverables according to schedule.",
        priority: "medium",
        dueAt: fmt(addDays(14)),
        estimatedDurationMinutes: 120,
        order: 2,
        dependencies: [0],
      },
      {
        title: `Review and finalize ${snippet}`,
        description: "Verify criteria completion and celebrate progress.",
        priority: "low",
        dueAt: fmt(addDays(21)),
        estimatedDurationMinutes: 45,
        order: 3,
        dependencies: [1],
      },
    ],
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generates a plan for the given goal and saves it to Firestore as
 * a "proposed" plan document. Returns the new planId.
 */
export async function generatePlan(
  goalId: string,
  ownerUid: string,
): Promise<string> {
  // 1. Fetch goal
  const goalRef = doc(db, "goals", goalId);
  const goalSnap = await getDoc(goalRef);
  if (!goalSnap.exists()) throw new Error("Goal not found.");

  const goalData = goalSnap.data();
  if (goalData.ownerUid !== ownerUid) {
    throw new Error("Goal does not belong to you.");
  }
  if (goalData.status === "archived") {
    throw new Error("Cannot plan an archived goal.");
  }

  // 2. Generate (mock for now; swap in real LLM call here later)
  const generated = generateMockPlan(
    goalData.title,
    goalData.description,
  );

  // 3. Determine version
  const existingSnap = await getDocs(
    query(
      collection(db, "plans"),
      where("ownerUid", "==", ownerUid),
      where("goalId", "==", goalId),
    ),
  );
  let maxVersion = 0;
  existingSnap.forEach((d) => {
    const v = d.data().version;
    if (typeof v === "number" && v > maxVersion) maxVersion = v;
  });
  const version = maxVersion + 1;

  // 4. Write plan to Firestore
  const planRef = await addDoc(collection(db, "plans"), {
    ownerUid,
    goalId,
    version,
    status: "proposed",
    providerMode: "mock",
    summary: generated.summary,
    milestones: generated.milestones,
    tasks: generated.tasks,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 5. Write activity log (best-effort, do not block on failure)
  addDoc(collection(db, "activityLogs"), {
    ownerUid,
    actionType: "GENERATE_PLAN",
    entityType: "plan",
    entityId: planRef.id,
    summary: `Orbit generated a proposed plan (v${version}) via mock.`,
    createdAt: serverTimestamp(),
  }).catch((e) => console.error("activityLog write failed:", e));

  return planRef.id;
}

export interface EditableTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueAt: string;
  estimatedDurationMinutes: number;
  order: number;
}

/**
 * Approves a proposed plan: creates tasks atomically, marks plan approved.
 * Idempotent — a second call on an already-approved plan returns early.
 */
export async function approvePlan(
  planId: string,
  ownerUid: string,
  editedTasks: EditableTask[],
): Promise<string[]> {
  // 1. Read plan
  const planRef = doc(db, "plans", planId);
  const planSnap = await getDoc(planRef);
  if (!planSnap.exists()) throw new Error("Plan not found.");

  const planData = planSnap.data();
  if (planData.ownerUid !== ownerUid) {
    throw new Error("Plan does not belong to you.");
  }

  // Idempotency: already approved
  if (planData.status === "approved") {
    const existingTasks = await getDocs(
      query(
        collection(db, "tasks"),
        where("ownerUid", "==", ownerUid),
        where("planId", "==", planId),
      ),
    );
    const ids: string[] = [];
    existingTasks.forEach((d) => ids.push(d.id));
    return ids;
  }

  if (planData.status !== "proposed") {
    throw new Error(`Plan is already ${planData.status} and cannot be approved.`);
  }

  // 2. Atomic batch: create tasks + update plan
  const batch = writeBatch(db);
  const taskIds: string[] = [];
  const now = serverTimestamp();

  for (const t of editedTasks) {
    const taskRef = doc(collection(db, "tasks"));
    taskIds.push(taskRef.id);

    const taskData: Record<string, unknown> = {
      ownerUid,
      goalId: planData.goalId,
      planId,
      title: t.title.trim(),
      status: "todo",
      priority: t.priority,
      order: t.order,
      createdAt: now,
      updatedAt: now,
    };
    if (t.description.trim()) taskData.description = t.description.trim();
    if (t.dueAt.trim()) {
      const d = new Date(t.dueAt.trim());
      if (!isNaN(d.getTime())) taskData.dueAt = Timestamp.fromDate(d);
    }
    const est = Number(t.estimatedDurationMinutes);
    if (est > 0 && est <= 1440) taskData.estimatedDurationMinutes = est;

    batch.set(taskRef, taskData);
  }

  batch.update(planRef, {
    status: "approved",
    approvedAt: now,
    updatedAt: now,
  });

  // Activity log
  const logRef = doc(collection(db, "activityLogs"));
  batch.set(logRef, {
    ownerUid,
    actionType: "APPROVE_PLAN",
    entityType: "plan",
    entityId: planId,
    summary: `Plan v${planData.version} approved — ${editedTasks.length} tasks created.`,
    createdAt: now,
  });

  await batch.commit();
  return taskIds;
}

/**
 * Rejects a proposed plan.
 */
export async function rejectPlan(
  planId: string,
  ownerUid: string,
): Promise<void> {
  const planRef = doc(db, "plans", planId);
  const planSnap = await getDoc(planRef);
  if (!planSnap.exists()) throw new Error("Plan not found.");

  const planData = planSnap.data();
  if (planData.ownerUid !== ownerUid) {
    throw new Error("Plan does not belong to you.");
  }
  if (planData.status !== "proposed") {
    throw new Error(`Plan is already ${planData.status}.`);
  }

  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.update(planRef, { status: "rejected", rejectedAt: now, updatedAt: now });

  const logRef = doc(collection(db, "activityLogs"));
  batch.set(logRef, {
    ownerUid,
    actionType: "REJECT_PLAN",
    entityType: "plan",
    entityId: planId,
    summary: `Plan v${planData.version} rejected.`,
    createdAt: now,
  });

  await batch.commit();
}

/**
 * Marks a task as done.
 */
export async function completeTask(
  taskId: string,
  ownerUid: string,
): Promise<void> {
  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().ownerUid !== ownerUid) {
    throw new Error("Task not found.");
  }
  await updateDoc(ref, {
    status: "done",
    completedAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Cancels a task (status → cancelled).
 */
export async function cancelTask(
  taskId: string,
  ownerUid: string,
): Promise<void> {
  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().ownerUid !== ownerUid) {
    throw new Error("Task not found.");
  }
  await updateDoc(ref, {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reschedules a task's due date.
 */
export async function rescheduleTask(
  taskId: string,
  ownerUid: string,
  dueDateStr: string, // YYYY-MM-DD
): Promise<void> {
  const date = new Date(dueDateStr);
  if (isNaN(date.getTime())) throw new Error("Invalid date.");

  const ref = doc(db, "tasks", taskId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().ownerUid !== ownerUid) {
    throw new Error("Task not found.");
  }
  await updateDoc(ref, {
    dueAt: Timestamp.fromDate(date),
    updatedAt: serverTimestamp(),
  });
}

