import type { LifeEventParseResult } from "@/src/domain/types";
import { parseWithMockRules } from "./mock-parser";
import { normalizeParseResult } from "./normalize";

export type ProviderInput = {
  userId: string;
  text: string;
  source: string;
  timestamp: string;
};

export interface AIProvider {
  parseLifeEvent(input: ProviderInput): Promise<LifeEventParseResult>;
}

export const mockProvider: AIProvider = {
  async parseLifeEvent(input) {
    return normalizeParseResult(parseWithMockRules(input.text, input.timestamp), input.text);
  }
};

export const localProvider: AIProvider = {
  async parseLifeEvent(input) {
    const baseUrl = process.env.LOCAL_LLM_BASE_URL;
    const model = process.env.LOCAL_LLM_MODEL;

    if (!baseUrl || !model) {
      return mockProvider.parseLifeEvent(input);
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Return only valid Life OS JSON. Types: task, activity, goal, reminder, inbox. Every task needs path one_off or goal; one_off forbids goal and goal path requires goal. Every new goal requires goalType and one lifeArea: work, growth, health, life, finance, relationships, or entertainment."
            },
            { role: "user", content: input.text }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        return mockProvider.parseLifeEvent(input);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const parsed: unknown = JSON.parse(content);
      return normalizeParseResult(parsed, input.text);
    } catch {
      return mockProvider.parseLifeEvent(input);
    }
  }
};

export function getAIProvider(): AIProvider {
  return process.env.AI_PROVIDER === "local" ? localProvider : mockProvider;
}
