/**
 * Firebase Functions Entrypoint
 */
import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import {executeGeneratePlan} from "./planner";
import {
  executeApprovePlan,
  executeRejectPlan,
  executeControlledAction,
} from "./actionExecutor";
import {openAiApiKeySecret, getOpenAIApiKey} from "./secrets";

if (admin.apps.length === 0) {
  const localKey = path.resolve(__dirname, "../serviceAccountKey.json");
  const rootKey = path.resolve(__dirname, "../../serviceAccountKey.json");
  const keyPath = fs.existsSync(localKey) ?
    localKey :
    (fs.existsSync(rootKey) ? rootKey : null);

  if (keyPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(keyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp();
  }
}

setGlobalOptions({maxInstances: 10});

/**
 * Callable function to return the configured provider status safely.
 * Returns only { mode: "mock" | "openai", keyConfigured: boolean }.
 */
export const providerStatus = onCall(
  {
    cors: true,
    secrets: [openAiApiKeySecret],
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }

    const envMode = (process.env.AI_PROVIDER || "mock").toLowerCase();
    const mode = envMode === "openai" ? "openai" : "mock";
    const key = getOpenAIApiKey();

    return {
      mode: mode as "mock" | "openai",
      keyConfigured: Boolean(key && key.length > 5),
    };
  },
);

export const generatePlan = onCall(
  {
    cors: true,
    secrets: [openAiApiKeySecret],
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }

    const callerUid = request.auth.uid;

    try {
      const result = await executeGeneratePlan(request.data, callerUid);
      return {
        success: true,
        planId: result.planId,
        plan: result.plan,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("generatePlan error:", msg);

      if (
        msg.includes("not found") ||
        msg.includes("does not belong") ||
        msg.includes("archived")
      ) {
        throw new HttpsError("permission-denied", msg);
      }
      if (
        msg.includes("Validation") ||
        msg.includes("Invalid") ||
        msg.includes("must be") ||
        msg.includes("required") ||
        msg.includes("ZodError") ||
        msg.includes("cyclic")
      ) {
        throw new HttpsError("invalid-argument", msg);
      }
      if (
        msg.includes("OPENAI_API_KEY is missing") ||
        msg.includes("AI_PROVIDER")
      ) {
        throw new HttpsError("failed-precondition", msg);
      }

      throw new HttpsError(
        "internal",
        "An error occurred while generating the plan. Please try again.",
      );
    }
  },
);

export const approvePlan = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }

    const callerUid = request.auth.uid;

    try {
      return await executeApprovePlan(request.data, callerUid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("approvePlan error:", msg);

      if (msg.includes("not found") || msg.includes("does not belong")) {
        throw new HttpsError("permission-denied", msg);
      }
      if (msg.includes("proposed") || msg.includes("status")) {
        throw new HttpsError("failed-precondition", msg);
      }
      if (msg.includes("Validation") || msg.includes("ZodError")) {
        throw new HttpsError("invalid-argument", msg);
      }

      throw new HttpsError("internal", "Failed to approve plan.");
    }
  },
);

export const rejectPlan = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }

    const callerUid = request.auth.uid;

    try {
      return await executeRejectPlan(request.data, callerUid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("rejectPlan error:", msg);

      if (msg.includes("not found") || msg.includes("does not belong")) {
        throw new HttpsError("permission-denied", msg);
      }
      if (msg.includes("proposed") || msg.includes("status")) {
        throw new HttpsError("failed-precondition", msg);
      }
      if (msg.includes("Validation") || msg.includes("ZodError")) {
        throw new HttpsError("invalid-argument", msg);
      }

      throw new HttpsError("internal", "Failed to reject plan.");
    }
  },
);

export const executeAction = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }

    const callerUid = request.auth.uid;

    try {
      return await executeControlledAction(request.data, callerUid);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("executeAction error:", msg);

      if (msg.includes("not found") || msg.includes("does not belong")) {
        throw new HttpsError("permission-denied", msg);
      }
      if (
        msg.includes("Validation") ||
        msg.includes("ZodError") ||
        msg.includes("Invalid")
      ) {
        throw new HttpsError("invalid-argument", msg);
      }

      throw new HttpsError("internal", "Failed to execute action.");
    }
  },
);
