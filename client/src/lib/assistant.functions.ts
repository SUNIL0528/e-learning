import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";

const Input = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

const SYSTEM = `You are the HTS Assistant for an e-learning platform.
You help students navigate the platform (Dashboard at /, Course pages at /courses/<id>, Forum at /forum, Profile at /profile, Doubts at /doubts),
answer FAQs, recommend courses, and troubleshoot account or playback issues.
Courses available: Coating Inspection, Figma Design Systems, SQL for Analysts, Motion Design 101, React Native Basics.
Keep answers short (under 90 words), concrete, and in a calm editorial tone.
If you cannot resolve something — billing, certificate errors, account recovery — say so plainly and tell the user you can escalate it to human support.`;

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      system: SYSTEM,
      messages: data.messages,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          store: false,
        },
      },
    });

    return { reply: await result.text };
  });
