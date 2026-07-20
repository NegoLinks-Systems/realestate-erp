import { supabase } from './supabase';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface AIResult { reply?: string; error?: string }

/**
 * Send a conversation to the NegoLinks Intelligence Engine (server-side ai-chat
 * function). The provider/model are chosen server-side and never returned here.
 * Any failure comes back as a friendly, provider-agnostic message.
 */
export async function askAI(messages: ChatMessage[], opts?: { module?: string; templateKey?: string }): Promise<AIResult> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { messages, module: opts?.module, template_key: opts?.templateKey },
    });
    if (error) {
      // Edge function returned a non-2xx; surface its friendly message if present.
      const ctx = (error as { context?: { body?: string } }).context;
      if (ctx?.body) {
        try { const parsed = JSON.parse(ctx.body); if (parsed?.error) return { error: parsed.error }; } catch { /* ignore */ }
      }
      return { error: 'The assistant is unavailable right now. Please try again shortly.' };
    }
    if (data?.error) return { error: data.error as string };
    return { reply: (data?.reply as string) ?? '' };
  } catch {
    return { error: 'The assistant is unavailable right now. Please try again shortly.' };
  }
}
