export type Command = { action: 'review' | 'full' | 'pause' | 'resume' | 'questions' } | { action: 'explain' | 'approve' | 'reject'; id: string } | { action: 'dismiss' | 'answer'; id: string; text: string } | { action: 'learn' | 'ask'; text: string };
export function parseCommand(body: string): Command | null {
  const text = body.trim();
  if (/^(?:@reviewbot\s+)?더\s+알아보자[.!?]?$/i.test(text)) return { action: 'questions' };
  const reply = text.match(/^(Q-[a-f0-9]{12})\s*[:：]\s*(\S[\s\S]*)$/i);
  if (reply) return { action: 'answer', id: reply[1]!.toLowerCase().replace(/^q-/, 'Q-'), text: reply[2]!.slice(0, 8000) };
  const match = text.match(/^\/reviewbot\s+(\w+)(?:\s+([\s\S]+))?$/i);
  if (!match) { const question = text.match(/^@reviewbot\s+([\s\S]+)$/i); return question ? { action: 'ask', text: question[1]!.slice(0, 4000) } : null; }
  const action = match[1]!.toLowerCase(), args = (match[2] ?? '').trim();
  if (['review', 'full', 'pause', 'resume', 'questions'].includes(action) && !args) return { action } as Command;
  if (action === 'answer') { const parts = args.match(/^(Q-[a-f0-9]{12})\s+(\S[\s\S]*)$/i); if (parts) return { action, id: parts[1]!.toLowerCase().replace(/^q-/, 'Q-'), text: parts[2]!.slice(0, 8000) }; }
  if (action === 'explain' && /^CRB-\d+$/.test(args)) return { action, id: args };
  if (['approve', 'reject'].includes(action) && /^[a-f0-9-]{36}$/.test(args)) return { action, id: args } as Command;
  if (action === 'dismiss') { const parts = args.match(/^(CRB-\d+)\s+(.+)$/s); if (parts) return { action, id: parts[1]!, text: parts[2]!.slice(0, 4000) }; }
  if (action === 'learn' && args) return { action, text: args.slice(0, 4000) };
  return null;
}
