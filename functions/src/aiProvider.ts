// aiProvider.ts - Common interface and types for AI plan generation
import {GeneratedPlan} from "./schemas";

export interface PlanGenerationRequest {
  goalTitle: string;
  goalDescription?: string;
  targetDate?: string;
  constraints?: string[];
  preferredSchedule?: string;
}

export interface AIProvider {
  readonly mode: "openai" | "mock";
  generatePlan(request: PlanGenerationRequest): Promise<GeneratedPlan>;
}
