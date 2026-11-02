import assert from "assert";
import {GeneratedPlanSchema, GeneratePlanInputSchema} from "../schemas";
import {MockProvider} from "../mockProvider";
import {OpenAIProvider} from "../openaiProvider";
import {executeGeneratePlan} from "../planner";

describe("Phase 7: AI Planning Backend", () => {
  const futureIsoDate = (days: number) => {
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  };

  describe("GeneratedPlanSchema & Task Validation", () => {
    it("accepts valid plan structure", () => {
      const valid = {
        summary: "Execution plan for building the feature",
        milestones: ["Phase 1 kickoff", "Phase 2 release"],
        tasks: [
          {
            title: "Task 1",
            description: "Initial research",
            priority: "high",
            dueAt: futureIsoDate(5),
            estimatedDurationMinutes: 60,
            order: 1,
            dependencies: [],
          },
          {
            title: "Task 2",
            description: "Implementation",
            priority: "medium",
            dueAt: futureIsoDate(10),
            estimatedDurationMinutes: 120,
            order: 2,
            dependencies: [0],
          },
        ],
      };

      const result = GeneratedPlanSchema.safeParse(valid);
      assert.strictEqual(result.success, true);
    });

    it("rejects plan when dueAt is in the past", () => {
      const invalid = {
        summary: "Plan with past date",
        tasks: [
          {
            title: "Task 1",
            priority: "low",
            dueAt: "2020-01-01",
            estimatedDurationMinutes: 30,
            order: 1,
            dependencies: [],
          },
        ],
      };
      const result = GeneratedPlanSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.errors[0].message.includes("dueAt must not be in the past"),
        );
      }
    });

    it("rejects plan with invalid dependency index referencing non-existent task", () => {
      const invalid = {
        summary: "Plan with out-of-range dependency",
        tasks: [
          {
            title: "Task 1",
            priority: "low",
            dueAt: futureIsoDate(5),
            estimatedDurationMinutes: 30,
            order: 1,
            dependencies: [5], // index 5 does not exist
          },
        ],
      };
      const result = GeneratedPlanSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.errors.some((e) => e.message.includes("invalid dependency")),
        );
      }
    });

    it("rejects plan with cyclic dependencies (direct self loop or mutual)", () => {
      // 1. Direct self loop
      const selfLoop = {
        summary: "Plan with self dependency",
        tasks: [
          {
            title: "Task 1",
            priority: "medium",
            dueAt: futureIsoDate(3),
            estimatedDurationMinutes: 40,
            order: 1,
            dependencies: [0],
          },
        ],
      };
      const selfLoopResult = GeneratedPlanSchema.safeParse(selfLoop);
      assert.strictEqual(selfLoopResult.success, false);

      // 2. Multi-node cycle: Task 0 -> Task 1 -> Task 0
      const cyclicPlan = {
        summary: "Cyclic plan",
        tasks: [
          {
            title: "Task 0",
            priority: "medium",
            dueAt: futureIsoDate(3),
            estimatedDurationMinutes: 40,
            order: 1,
            dependencies: [1],
          },
          {
            title: "Task 1",
            priority: "high",
            dueAt: futureIsoDate(4),
            estimatedDurationMinutes: 50,
            order: 2,
            dependencies: [0],
          },
        ],
      };
      const cycleResult = GeneratedPlanSchema.safeParse(cyclicPlan);
      assert.strictEqual(cycleResult.success, false);
      if (!cycleResult.success) {
        assert.ok(
          cycleResult.error.errors.some((e) =>
            e.message.includes("cyclic dependencies"),
          ),
        );
      }
    });

    it("rejects malformed AI output (missing summary or empty tasks)", () => {
      const malformed1 = {
        milestones: ["m1"],
        tasks: [],
      };
      assert.strictEqual(GeneratedPlanSchema.safeParse(malformed1).success, false);

      const malformed2 = {
        summary: "",
        tasks: [
          {
            title: "Task 1",
            priority: "invalid_priority",
            dueAt: futureIsoDate(2),
            estimatedDurationMinutes: 30,
            order: 1,
          },
        ],
      };
      assert.strictEqual(GeneratedPlanSchema.safeParse(malformed2).success, false);
    });
  });

  describe("Input Validation (GeneratePlanInputSchema)", () => {
    it("validates correct goalId and optional constraints", () => {
      const valid = {
        goalId: "goal_123",
        constraints: ["Must finish before Friday", "No overtime"],
      };
      const res = GeneratePlanInputSchema.safeParse(valid);
      assert.strictEqual(res.success, true);
    });

    it("rejects missing or empty goalId", () => {
      assert.strictEqual(GeneratePlanInputSchema.safeParse({}).success, false);
      assert.strictEqual(
        GeneratePlanInputSchema.safeParse({goalId: ""}).success,
        false,
      );
    });

    it("rejects oversized constraints array or strings", () => {
      const tooMany = {
        goalId: "goal_123",
        constraints: new Array(25).fill("Constraint item"),
      };
      assert.strictEqual(GeneratePlanInputSchema.safeParse(tooMany).success, false);

      const tooLongItem = {
        goalId: "goal_123",
        constraints: ["a".repeat(301)],
      };
      assert.strictEqual(
        GeneratePlanInputSchema.safeParse(tooLongItem).success,
        false,
      );
    });
  });

  describe("MockProvider Determinism & Mode", () => {
    it("returns schema-valid, deterministic plan with providerMode mock", async () => {
      const provider = new MockProvider();
      assert.strictEqual(provider.mode, "mock");

      const req = {
        goalTitle: "Launch SaaS Product",
        goalDescription: "Build MVP and launch on Product Hunt",
      };

      const plan1 = await provider.generatePlan(req);
      const plan2 = await provider.generatePlan(req);

      assert.strictEqual(plan1.summary, plan2.summary);
      assert.strictEqual(plan1.tasks.length, 3);
      assert.strictEqual(plan1.tasks.length, plan2.tasks.length);
      assert.strictEqual(plan1.tasks[0].title, plan2.tasks[0].title);
      assert.deepStrictEqual(plan1.tasks[1].dependencies, [0]);
    });
  });

  describe("OpenAIProvider Error Handling & Fallback Prevention", () => {
    it("fails with a clear error when AI_PROVIDER=openai and OPENAI_API_KEY is missing", () => {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        assert.throws(
          () => new OpenAIProvider({apiKey: ""}),
          /AI_PROVIDER is set to 'openai' but OPENAI_API_KEY is missing/,
        );
      } finally {
        if (origKey) process.env.OPENAI_API_KEY = origKey;
      }
    });
  });

  describe("Planner Execution (executeGeneratePlan)", () => {
    it("rejects unauthenticated invocation", async () => {
      try {
        await executeGeneratePlan({goalId: "g1"}, "");
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.ok(err.message.includes("Authentication required"));
      }
    });

    it("rejects invalid input schema", async () => {
      try {
        await executeGeneratePlan({goalId: ""}, "user_1");
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.strictEqual(err.name, "ZodError");
      }
    });

    it("rejects plan generation if goal does not belong to caller", async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (id: string) => ({
            get: async () => ({
              exists: true,
              data: () => ({
                ownerUid: "different_user",
                title: "Other User Goal",
                status: "active",
              }),
            }),
          }),
        }),
      };

      try {
        await executeGeneratePlan({goalId: "other_goal"}, "current_user", {
          firestore: mockDb,
        });
        assert.fail("Should have thrown error");
      } catch (err: any) {
        assert.ok(err.message.includes("Goal does not belong to caller"));
      }
    });

    it("successfully creates proposed plan with mock provider and logs activity", async () => {
      let savedPlan: any = null;
      let savedLog: any = null;

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (id?: string) => ({
            id: id || `mock_id_${col}`,
            get: async () => {
              if (col === "goals") {
                return {
                  exists: true,
                  data: () => ({
                    ownerUid: "test_user",
                    title: "Learn Rust",
                    status: "active",
                  }),
                };
              }
              return {exists: false};
            },
          }),
          where: () => ({
            where: () => ({
              get: async () => [
                {
                  data: () => ({version: 1}),
                },
              ],
            }),
          }),
        }),
        batch: () => ({
          set: (ref: any, data: any) => {
            if (ref.id.includes("plans")) savedPlan = data;
            if (ref.id.includes("activityLogs")) savedLog = data;
          },
          commit: async () => {},
        }),
      };

      const mockProvider = new MockProvider();
      const res = await executeGeneratePlan(
        {goalId: "goal_rust"},
        "test_user",
        {provider: mockProvider, firestore: mockDb},
      );

      assert.strictEqual(typeof res.planId, "string");
      assert.strictEqual(res.plan.ownerUid, "test_user");
      assert.strictEqual(res.plan.status, "proposed");
      assert.strictEqual(res.plan.providerMode, "mock");
      assert.strictEqual(res.plan.version, 2);
      assert.ok(savedPlan !== null);
      assert.strictEqual(savedPlan.providerMode, "mock");
      assert.ok(savedLog !== null);
      assert.strictEqual(savedLog.actionType, "GENERATE_PLAN");
      assert.strictEqual(savedLog.entityType, "plan");
    });
  });
});
