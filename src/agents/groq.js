// Together AI client (Replaces Groq) — Free tier, Llama-3.3-70B
// Keys come from user Settings (localStorage), not build-time env vars.

import { getGroqKey, hasGroqKey } from '../utils/config';

const GROQ_API = 'https://api.together.xyz/v1/chat/completions';
const MODEL    = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';

export function hasApiKey() { return hasGroqKey(); }

export async function callGroq(systemPrompt, userMessage, options = {}) {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  const res = await fetch(GROQ_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  options.maxTokens  || 600,
      temperature: options.temperature ?? 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(options.history || []),
        { role: 'user',   content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function* callGroqStream(systemPrompt, userMessage, options = {}) {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  const res = await fetch(GROQ_API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model:       MODEL,
      max_tokens:  options.maxTokens  || 600,
      temperature: options.temperature ?? 0.7,
      stream:      true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(options.history || []),
        { role: 'user',   content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq HTTP ${res.status}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return;
        try {
          const chunk = JSON.parse(raw);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    }
  }
}
