import { NextRequest, NextResponse } from "next/server";
import { env, validateServerEnv } from "@/lib/env";
import { buildPlannerSystemPrompt } from "@/lib/prompts";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await request.json();
    const messages = (body.messages ?? []) as ChatMessage[];

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();

    const systemPrompt = buildPlannerSystemPrompt(profile, messages);

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.mistralApiKey}`
      },
      body: JSON.stringify({
        model: env.mistralModel,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `Mistral API error: ${response.status}`,
          details: errorText
        },
        { status: 500 }
      );
    }

    const result = await response.json();
    const assistantMessage =
      result?.choices?.[0]?.message?.content ??
      "J'ai bien recu votre demande. Il me manque encore quelques details avant de lancer la recherche.";

    return NextResponse.json({
      assistantMessage,
      profileSummaryUsed: profile
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
