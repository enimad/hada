import { NextRequest, NextResponse } from "next/server";
import { env, validateServerEnv } from "@/lib/env";
import { buildPlannerSystemPrompt } from "@/lib/prompts";
import {
  bootstrapConversationIfNeeded,
  buildSearchAnnouncement,
  computeSearchIntent,
  createSearchResultsForUser,
  extractConversationForModel,
  insertConversationMessage
} from "@/lib/server/hada";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const { conversation, messages } = await bootstrapConversationIfNeeded(supabase, user.id, profile);

    return NextResponse.json({
      conversationId: conversation.id,
      messages,
      profile
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

export async function POST(request: NextRequest) {
  try {
    validateServerEnv();
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase.from("wedding_profiles").select("*").eq("user_id", user.id).maybeSingle();
    const { conversation, messages: seededMessages } = await bootstrapConversationIfNeeded(supabase, user.id, profile);

    const userMessage = await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: "user",
      content
    });

    const historyForModel: ChatMessage[] = extractConversationForModel([...seededMessages, userMessage]);
    const systemPrompt = buildPlannerSystemPrompt(profile, historyForModel);

    const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
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
          ...historyForModel.map((message) => ({
            role: message.role,
            content: message.content
          }))
        ]
      })
    });

    let assistantText =
      "J'ai bien recu votre demande. Il me manque encore quelques details avant de lancer la recherche du meilleur prestataire.";

    if (mistralResponse.ok) {
      const result = await mistralResponse.json();
      assistantText = result?.choices?.[0]?.message?.content ?? assistantText;
    }

    const intent = computeSearchIntent(content, profile);
    let metadata: Record<string, unknown> | undefined;
    let searchResultsCount = 0;

    if (intent.category === "venue" && intent.canLaunch) {
      const { candidates } = await createSearchResultsForUser(supabase, {
        userId: user.id,
        conversationId: conversation.id,
        category: "venue",
        query: content,
        profile
      });

      searchResultsCount = candidates.length;
      if (candidates.length > 0) {
        assistantText = `${assistantText}\n\n${buildSearchAnnouncement("venue", candidates.length)}`;
        metadata = {
          ctaHref: "/venues",
          ctaLabel: "Voir les propositions de lieux"
        };
      }
    } else if (intent.category === "venue" && intent.missingFields.length > 0) {
      assistantText = `${assistantText}\n\nPour que je puisse lancer une recherche de lieux pertinente, il me manque encore ${intent.missingFields.join(", ")}.`;
    }

    const assistantMessage = await insertConversationMessage(supabase, {
      conversationId: conversation.id,
      role: "assistant",
      content: assistantText,
      metadata
    });

    return NextResponse.json({
      conversationId: conversation.id,
      assistantMessage,
      searchResultsCount
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
