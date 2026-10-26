/**
 * Minimal AI client shared by the name and place suggesters.
 * Provider is chosen by env: ANTHROPIC_API_KEY or OPENAI_API_KEY
 * (override with AI_PROVIDER=anthropic|openai). Model via AI_MODEL.
 */

function provider(): "anthropic" | "openai" | null {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "anthropic" || forced === "openai") return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export const NO_PROVIDER_ERROR =
  "No AI provider configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)";

export function isSuggestionEnabled(): boolean {
  return provider() !== null;
}

export async function callModel(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const which = provider();

  if (which === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-sonnet-4-5",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Anthropic API error: ${response.status} ${await response.text()}`,
      );
    }
    const data = (await response.json()) as {
      content: { type: string; text?: string }[];
    };
    return data.content.map((c) => c.text ?? "").join("");
  }

  if (which === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(
        `OpenAI API error: ${response.status} ${await response.text()}`,
      );
    }
    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0]?.message.content ?? "";
  }

  throw new Error(NO_PROVIDER_ERROR);
}

/** Extract the `results` array from a JSON (possibly wrapped in prose) model reply */
export function parseResults<T>(text: string): T[] {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as { results?: T[] };
  return Array.isArray(parsed.results) ? parsed.results : [];
}
