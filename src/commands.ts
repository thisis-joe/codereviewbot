export type Command = { action: 'review' | 'full' | 'pause' | 'resume' | 'questions' | 'help' } | { action: 'approve' | 'reject'; id: string } | { action: 'explain'; id: string | null } | { action: 'dismiss'; id: string | null; text: string } | { action: 'answer'; id: string; text: string; more?: Answer[] } | { action: 'learn' | 'ask'; text: string };
export interface Answer { id: string; text: string }
// Each answer starts with a question reference (Q2 for review questions, 심화2 for follow-ups);
// a reference inside reasoning only splits when a space, an option letter or the end follows.
const answerRef = /(?<=^|\s)(?:(Q-[a-f0-9]{12})|Q(\d{1,3})(?!\d)|심화\s?(\d{1,3})(?!\d))[.:)]?(?=\s|[A-Za-z](?![A-Za-z0-9])|$)/gi;
export const MAX_ANSWERS = 10;
function parseAnswers(args: string): Answer[] | null {
  const refs = [...args.matchAll(answerRef)];
  if (!refs.length || refs[0]!.index !== 0 || refs.length > MAX_ANSWERS) return null;
  const answers = refs.map((m, i) => ({ id: m[1] ? m[1].toLowerCase().replace(/^q-/, 'Q-') : m[2] ? `Q${Number(m[2])}` : `심화${Number(m[3])}`, text: args.slice(m.index! + m[0].length, refs[i + 1]?.index ?? args.length).trim().slice(0, 8000) }));
  return answers.every(a => a.text && !/^[.:)]/.test(a.text)) ? answers : null;
}
export function parseCommand(body: string): Command | null {
  const text = body.trim();
  const reply = text.match(/^(Q-[a-f0-9]{12})\s*[:：]\s*(\S[\s\S]*)$/i);
  if (reply) return { action: 'answer', id: reply[1]!.toLowerCase().replace(/^q-/, 'Q-'), text: reply[2]!.slice(0, 8000) };
  const match = text.match(/^\/reviewbot\s+(\w+)(?:\s+([\s\S]+))?$/i);
  if (!match) { const question = text.match(/^@reviewbot\s+([\s\S]+)$/i); return question ? { action: 'ask', text: question[1]!.slice(0, 4000) } : null; }
  const action = match[1]!.toLowerCase(), args = (match[2] ?? '').trim();
  if (['review', 'full', 'pause', 'resume', 'help'].includes(action) && !args) return { action } as Command;
  if (action === 'morequestion' && !args) return { action: 'questions' };
  if (action === 'answer') {
    // Comments show revision-wide numbers (Q3), while Q-hex IDs from older comments keep working.
    const [first, ...more] = parseAnswers(args) ?? [];
    if (first) return { action, ...first, ...(more.length ? { more } : {}) };
  }
  // Without an ID, explain/dismiss target the finding thread they reply in (explain alone also covers every open finding).
  if (action === 'explain' && (!args || /^CRB-\d+$/.test(args))) return { action, id: args || null };
  if (['approve', 'reject'].includes(action) && /^[a-f0-9-]{36}$/.test(args)) return { action, id: args } as Command;
  if (action === 'dismiss') { const parts = args.match(/^(?:(CRB-\d+)(?:\s+|$))?([\s\S]*)$/); if (parts?.[2]) return { action, id: parts[1] ?? null, text: parts[2].slice(0, 4000) }; }
  if (action === 'learn' && args) return { action, text: args.slice(0, 4000) };
  return null;
}
