/**
 * The single AI boundary. Swap this file to move to Gemini, OpenAI, Workers AI,
 * etc. Everything else only depends on `roastWithAI` and `RoastResult`.
 */
import { RoastResultSchema, type RoastMode, type RoastResult, type Signals } from "../lib/schema";
import { fixtureRoast } from "./fixture";
import { factsBlock, systemPromptFor } from "./prompt";

/** Groq vision-capable model. Change here only. */
export const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
/** Brutal mode wants precision; comedy mode gets a little more rope for jokes. */
const TEMPERATURE: Record<RoastMode, number> = { brutal: 0.4, comedy: 0.7 };
const MAX_TOKENS = 2048;

export interface RoastInput {
  url: string;
  /** Defaults to "brutal". */
  mode?: RoastMode;
  signals: Signals;
  /** data:image/webp;base64,... */
  desktopDataUrl: string;
  mobileDataUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export async function roastWithAI(input: RoastInput): Promise<RoastResult> {
  const mode: RoastMode = input.mode ?? "brutal";
  if (!input.apiKey) {
    // Mock mode: deterministic fixture so the UI can be built without a key.
    return fixtureRoast(input.url, input.signals, mode);
  }
  const f = input.fetchImpl ?? fetch;

  const body = {
    model: GROQ_MODEL,
    temperature: TEMPERATURE[mode],
    max_tokens: MAX_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPromptFor(mode) },
      {
        role: "user",
        content: [
          { type: "text", text: `${factsBlock(input.signals, input.url)}\n\nImage 1 is the DESKTOP screenshot (1440x900). Image 2 is the MOBILE screenshot (390x844). Return the JSON review now.` },
          { type: "image_url", image_url: { url: input.desktopDataUrl } },
          { type: "image_url", image_url: { url: input.mobileDataUrl } },
        ],
      },
    ],
  };

  const attempt = async (): Promise<RoastResult> => {
    const res = await f(GROQ_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new AIError(`Groq returned ${res.status}`, res.status, await res.text().catch(() => undefined));
    }
    const json = (await res.json()) as ChatCompletion;
    const content = json.choices?.[0]?.message?.content ?? "";
    return parseRoastJson(content);
  };

  try {
    return await attempt();
  } catch (err) {
    // One retry on malformed output or transient 5xx; rate limits bubble up.
    if (err instanceof AIError && (err.status === 429 || err.status === 401 || err.status === 403)) throw err;
    return attempt();
  }
}

/** Parse model output, tolerating code fences and leading prose. */
export function parseRoastJson(content: string): RoastResult {
  let text = content.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence?.[1]) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new AIError("Model returned no JSON object", 502, content.slice(0, 500));
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  const result = RoastResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new AIError(`Model JSON failed validation: ${result.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`, 502, content.slice(0, 500));
  }
  return clampBoxes(result.data);
}

function clampBoxes(r: RoastResult): RoastResult {
  return {
    ...r,
    roasts: r.roasts.map((item) => {
      const x = Math.min(Math.max(item.box.x, 0), 0.98);
      const y = Math.min(Math.max(item.box.y, 0), 0.98);
      const w = Math.min(Math.max(item.box.w, 0.02), 1 - x);
      const h = Math.min(Math.max(item.box.h, 0.02), 1 - y);
      return { ...item, box: { ...item.box, x, y, w, h } };
    }),
  };
}
