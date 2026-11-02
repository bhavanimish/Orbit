import assert from "assert";
import {
  executeApprovePlan,
  executeRejectPlan,
  executeControlledAction,
} from "../actionExecutor";
import {ExecuteActionInputSchema} from "../schemas";

describe("Phase 9: Action Executor & Plan Approval Backend", () => {
  describe("executeApprovePlan", () => {
    it("approving twice is idempotent and does not duplicate tasks", async () => {
      let planStatus = "proposed";
      const createdTasks: any[] = [];
      const planTasks = [
        {title: "Task 1", priority: "high", order: 1, dueAt: "2026-12-01"},
        {title: "Task 2", priority: "low", order: 2, dueAt: "2026-12-02"},
      ];

      const mockDb: any = {
        collection: (col: string) => {
          if (col === "plans") {
            return {
              doc: (id: string) => ({
                id,
              }),
            };
          }
          if (col === "tasks") {
            return {
              doc: () => ({
                id: `task_${createdTasks.length + 1}`,
              }),
              where: () => ({
                where: () => ({
                  get: async () => ({
                    forEach: (cb: any) => {
                      createdTasks.forEach((t) => cb({id: t.id}));
                    },
                  }),
                }),
              }),
            };
          }
          if (col === "activityLogs") {
            return {
              doc: () => ({id: "log_1"}),
            };
          }
          return {doc: () => ({id: "default_doc"})};
        },
        runTransaction: async (fn: any) => {
          const transaction = {
            get: async (target: any) => {
              if (target && !target.id) {
                return {
                  forEach: (cb: any) => createdTasks.forEach(cb),
                };
              }
              return {
                exists: true,
                data: () => ({
                  ownerUid: "user_alice",
                  goalId: "goal_1",
                  status: planStatus,
                  version: 1,
                  tasks: planTasks,
                }),
              };
            },
            set: (ref: any, data: any) => {
              if (ref.id.startsWith("task_")) {
                createdTasks.push({id: ref.id, ...data});
              }
            },
            update: (_ref: any, data: any) => {
              if (data.status) planStatus = data.status;
            },
          };
          return await fn(transaction);
        },
      };

      // 1. First approval
      const firstRes = await executeApprovePlan(
        {planId: "plan_1"},
        "user_alice",
        {firestore: mockDb},
      );
      assert.strictEqual(firstRes.success, true);
      assert.strictEqual(firstRes.taskIds.length, 2);
      assert.strictEqual(createdTasks.length, 2);
      assert.strictEqual(planStatus, "approved");

      // 2. Second approval (double-tap)
      const secondRes = await executeApprovePlan(
        {planId: "plan_1"},
        "user_alice",
        {firestore: mockDb},
      );
      assert.strictEqual(secondRes.success, true);
      assert.strictEqual(secondRes.taskIds.length, 2);
      // Ensure no extra tasks were created!
      assert.strictEqual(createdTasks.length, 2);
    });

    it("prevents user B from approving user A's plan", async () => {
      const mockDb: any = {
        collection: () => ({
          doc: (id: string) => ({id}),
        }),
        runTransaction: async (fn: any) => {
          const transaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                ownerUid: "user_alice",
                goalId: "goal_1",
                status: "proposed",
              }),
            }),
          };
          return await fn(transaction);
        },
      };

      try {
        await executeApprovePlan({planId: "plan_1"}, "user_bob", {
          firestore: mockDb,
        });
        assert.fail("Should have thrown permission error");
      } catch (err: any) {
        assert.ok(err.message.includes("Plan does not belong to caller"));
      }
    });
  });

  describe("executeRejectPlan", () => {
    it("rejects proposed plan and updates status to rejected", async () => {
      let updatedStatus = "";
      const mockDb: any = {
        collection: () => ({
          doc: (id: string) => ({id}),
        }),
        runTransaction: async (fn: any) => {
          const transaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                ownerUid: "user_alice",
                status: "proposed",
                version: 1,
              }),
            }),
            update: (_ref: any, data: any) => {
              updatedStatus = data.status;
            },
            set: () => {},
          };
          return await fn(transaction);
        },
      };

      const res = await executeRejectPlan({planId: "plan_1"}, "user_alice", {
        firestore: mockDb,
      });
      assert.strictEqual(res.success, true);
      assert.strictEqual(updatedStatus, "rejected");
    });
  });

  describe("executeControlledAction", () => {
    it("rejects invalid action types", () => {
      const invalid = {
        actionType: "DELETE_ALL_TASKS",
        idempotencyKey: "key_1",
        payload: {},
      };
      const parseResult = ExecuteActionInputSchema.safeParse(invalid);
      assert.strictEqual(parseResult.success, false);
    });

    it("retries with same idempotency key return cached result without re-executing", async () => {
      let executedCount = 0;
      const storedActions: Record<string, any> = {
        "key_already_run": {
          ownerUid: "user_alice",
          executionStatus: "success",
          executionResult: JSON.stringify({taskId: "t1", status: "done"}),
        },
      };

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (id: string) => ({
            id,
            get: async () => {
              if (col === "agentActions") {
                return {
                  exists: true,
                  data: () => ({
                    ownerUid: "user_alice",
                    executionStatus: "success",
                    executionResult: JSON.stringify({taskId: "t1", status: "done"}),
                  }),
                };
              }
              return {exists: false};
            },
          }),
        }),
        runTransaction: async (fn: any) => {
          return await fn({
            get: async (ref: any) => {
              if (ref && ref.path && ref.path.startsWith("agentActions/")) {
                return {
                  exists: true,
                  data: () => ({
                    ownerUid: "user_alice",
                    executionStatus: "success",
                    executionResult: JSON.stringify({taskId: "t1", status: "done"}),
                  }),
                };
              }
              // Fallback for doc/collection refs
              return {
                exists: true,
                data: () => ({
                  ownerUid: "user_alice",
                  executionStatus: "success",
                  executionResult: JSON.stringify({taskId: "t1", status: "done"}),
                }),
              };
            },
            update: () => {
              executedCount++;
            },
            set: () => {
              executedCount++;
            },
          });
        },
      };

      const res = await executeControlledAction(
        {
          actionType: "COMPLETE_TASK",
          idempotencyKey: "key_already_run",
          payload: {taskId: "t1"},
        },
        "user_alice",
        {firestore: mockDb},
      );

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.result, {taskId: "t1", status: "done"});
      assert.strictEqual(executedCount, 0); // Didn't touch transaction!
    });
  });
});

