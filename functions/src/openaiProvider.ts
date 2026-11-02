// openaiProvider.ts - OpenAI provider using structured JSON output
import {AIProvider, PlanGenerationRequest} from "./aiProvider";
import {GeneratedPlan, GeneratedPlanSchema} from "./schemas";
import {getOpenAIApiKey} from "./secrets";

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * OpenAI provider generating plans via chat completions with JSON mode.
 */
export class OpenAIProvider implements AIProvider {
  readonly mode = "openai" as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  /**
   * Initializes OpenAI provider with validated API credentials.
   * @param {OpenAIProviderOptions} [options] Optional custom config.
   */
  constructor(options?: OpenAIProviderOptions) {
    const key = options?.apiKey !== undefined ?
      options.apiKey :
      getOpenAIApiKey();
    if (!key) {
      throw new Error(
        "AI_PROVIDER is set to 'openai' but OPENAI_API_KEY is missing.",
      );
    }
    this.apiKey = key;
    this.model = options?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.timeoutMs = options?.timeoutMs || 25000;
  }

  /**
   * Generates a plan using OpenAI with structured schema validation and retry.
   * @param {PlanGenerationRequest} request Goal details and constraints.
   * @return {Promise<GeneratedPlan>} Validated generated plan.
   */
  async generatePlan(request: PlanGenerationRequest): Promise<GeneratedPlan> {
    const systemPrompt =
      "You are Orbit, an AI executive assistant. Your task is to generate " +
      "a realistic, actionable execution plan for a user's goal. " +
      "Return ONLY a JSON object that satisfies this exact structure: " +
      "{\n" +
      "  \"summary\": string (max 2000 chars),\n" +
      "  \"milestones\": string[] (max 20 items),\n" +
      "  \"tasks\": Array<{\n" +
      "    \"title\": string (max 200 chars),\n" +
      "    \"description\": string (optional, max 1000 chars),\n" +
      "    \"priority\": \"low\" | \"medium\" | \"high\",\n" +
      "    \"dueAt\": string (ISO YYYY-MM-DD format in the near future),\n" +
      "    \"estimatedDurationMinutes\": integer (1 to 1440),\n" +
      "    \"order\": integer,\n" +
      "    \"dependencies\": integer[] (indices in array; no cycles)\n" +
      "  }>\n" +
      "}";

    const userPrompt = JSON.stringify({
      goalTitle: request.goalTitle,
      goalDescription: request.goalDescription,
      targetDate: request.targetDate,
      constraints: request.constraints,
      preferredSchedule: request.preferredSchedule,
      today: new Date().toISOString().split("T")[0],
    });

    let lastError: Error | null = null;
    // Attempt up to 2 times (initial attempt + at most 1 retry)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.callOpenAI(systemPrompt, userPrompt);
        return GeneratedPlanSchema.parse(result);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    const errDesc = lastError?.message || "Unknown error";
    throw new Error(`OpenAI plan generation failed after retry: ${errDesc}`);
  }

  /**
   * Sends prompt payload to OpenAI chat completions endpoint.
   * @param {string} systemPrompt System instructions.
   * @param {string} userPrompt User request payload.
   * @return {Promise<unknown>} Parsed JSON completion response.
   */
  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            response_format: {type: "json_object"},
            messages: [
              {role: "system", content: systemPrompt},
              {role: "user", content: userPrompt},
            ],
            temperature: 0.3,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `OpenAI API HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI returned empty message content.");
      }

      return JSON.parse(content);
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "AbortError") {
        throw new Error(`OpenAI request timed out after ${this.timeoutMs}ms.`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
