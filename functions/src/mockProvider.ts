// mockProvider.ts - Deterministic, schema-valid mock AI provider
import {AIProvider, PlanGenerationRequest} from "./aiProvider";
import {GeneratedPlan, GeneratedPlanSchema} from "./schemas";

/**
 * Mock provider producing deterministic, valid plans without external APIs.
 */
export class MockProvider implements AIProvider {
  readonly mode = "mock" as const;

  /**
   * Generates a deterministic plan for the given goal request.
   * @param {PlanGenerationRequest} request Goal details and constraints.
   * @return {Promise<GeneratedPlan>} Validated generated plan.
   */
  async generatePlan(request: PlanGenerationRequest): Promise<GeneratedPlan> {
    const today = new Date();
    const d1 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const d2 = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const d3 = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000);

    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const titleSnippet = request.goalTitle.slice(0, 50);

    const rawPlan = {
      summary:
        `Structured execution plan for: ${request.goalTitle.slice(0, 100)}`,
      milestones: [
        "Milestone 1: Research and initial breakdown",
        "Milestone 2: Execution and iteration",
        "Milestone 3: Final validation and completion",
      ],
      tasks: [
        {
          title: `Research and planning for ${titleSnippet}`,
          description: "Establish baseline requirements and constraints.",
          priority: "high" as const,
          dueAt: fmt(d1),
          estimatedDurationMinutes: 60,
          order: 1,
          dependencies: [],
        },
        {
          title: `Implement primary phase for ${titleSnippet}`,
          description: "Execute core deliverables according to schedule.",
          priority: "medium" as const,
          dueAt: fmt(d2),
          estimatedDurationMinutes: 120,
          order: 2,
          dependencies: [0],
        },
        {
          title: `Review and finalize ${titleSnippet}`,
          description: "Verify criteria completion and celebrate progress.",
          priority: "low" as const,
          dueAt: fmt(d3),
          estimatedDurationMinutes: 45,
          order: 3,
          dependencies: [1],
        },
      ],
    };

    return GeneratedPlanSchema.parse(rawPlan);
  }
}
