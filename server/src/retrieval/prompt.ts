import type { ChatMessage } from '../utils/openai';
import type { STMPage } from '../memory/stm';
import type { MTMPage } from '../memory/mtm';
import type { LPMRetrievalResult } from './lpm';

// Build the OpenAI messages array for /chat from all retrieved memory tiers.
// Paper Sec 3.5 — combines STM (recent flow), MTM (relevant past), LPM (persona).
export function buildPrompt(args: {
  stm: STMPage[];
  mtmPages: MTMPage[];
  lpm: LPMRetrievalResult;
  currentMessage: string;
}): ChatMessage[] {
  const { stm, mtmPages, lpm, currentMessage } = args;

  // ---------- System prompt ----------
  const parts: string[] = [
    'You are a helpful AI assistant with persistent memory across sessions.',
    'Use the context below to give a personalized, coherent answer.',
    'If memory contains relevant facts about the user, naturally apply them.',
    'Do not mention "memory" or "context"; just respond naturally.',
  ];

  // Agent identity
  if (lpm.agentProfile) {
    parts.push('\n[Agent Identity]');
    parts.push(`Role: ${lpm.agentProfile.role}`);
    parts.push(`Character: ${lpm.agentProfile.character}`);
  }

  // User profile (static)
  if (lpm.userProfile) {
    const up = lpm.userProfile;
    const nameLine = up.name ? `Name: ${up.name}` : null;
    const genderLine = up.gender ? `Gender: ${up.gender}` : null;
    const yearLine = up.birthYear ? `Birth year: ${up.birthYear}` : null;
    const lines = [nameLine, genderLine, yearLine].filter(Boolean) as string[];
    if (lines.length > 0) {
      parts.push('\n[User Profile]');
      parts.push(...lines);
    }
  }

  // User Traits (90-dim) — paper Sec 3.4: "All information in the User Profile,
  // Agent Profile, and User Traits is utilized." So include every dimension,
  // not just non-zero ones. Zero values are still informative ("user has not
  // demonstrated this trait yet"). Tokens for 90 numeric fields are small.
  const traitEntries = Object.entries(lpm.userTraits);
  if (traitEntries.length > 0) {
    parts.push('\n[User Traits — 90-dim personality / preferences]');
    parts.push(traitEntries.map(([k, v]) => `${k}: ${v}`).join('\n'));
  }

  // User KB (top-10 facts)
  if (lpm.userKbFacts.length > 0) {
    parts.push('\n[Known facts about user]');
    parts.push(lpm.userKbFacts.map((f) => `- ${f}`).join('\n'));
  }

  // Agent Traits (top-10 prior AI behaviors)
  if (lpm.agentTraitEntries.length > 0) {
    parts.push('\n[Things you have previously told/recommended]');
    parts.push(lpm.agentTraitEntries.map((t) => `- ${t}`).join('\n'));
  }

  // MTM — top-10 past Q&As (cross-session memory)
  if (mtmPages.length > 0) {
    parts.push('\n[Relevant past conversations]');
    for (const p of mtmPages) {
      const chain = p.metaChain ? ` (context: ${p.metaChain})` : '';
      parts.push(`- User said: "${p.query}" → You answered: "${p.response}"${chain}`);
    }
  }

  const systemContent = parts.join('\n');

  // ---------- Messages array ----------
  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
  ];

  // STM = the recent in-session Q&A flow.
  for (const page of stm) {
    messages.push({ role: 'user', content: page.query });
    messages.push({ role: 'assistant', content: page.response });
  }

  // The current user turn.
  messages.push({ role: 'user', content: currentMessage });

  return messages;
}
