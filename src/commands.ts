export type Command = { action: 'tryagain' | 'questions' | 'help' } | { action: 'answer'; id: string; text: string; more?: Answer[] } | { action: 'reveal'; ids: string[] } | { action: 'ask'; text: string };
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
  const match = text.match(/^\/(?:hey|reviewbot)\s+(\w+)(?:\s+([\s\S]+))?$/i);
  if (!match) { const question = text.match(/^@(?:hey|reviewbot)\s+([\s\S]+)$/i); return question ? { action: 'ask', text: question[1]!.slice(0, 4000) } : null; }
  const action = match[1]!.toLowerCase(), args = (match[2] ?? '').trim();
  if (['tryagain', 'help'].includes(action) && !args) return { action } as Command;
  if (action === 'morequestion' && !args) return { action: 'questions' };
  // Without labels every review question is revealed; labels (Q1, 심화2) pick specific ones, follow-ups included.
  if (action === 'showanswer') {
    const ids = args ? args.split(/\s+/).map(a => a.match(/^(?:Q(\d{1,3})|심화(\d{1,3}))$/i)) : [];
    if (ids.length <= MAX_ANSWERS && ids.every(Boolean)) return { action: 'reveal', ids: [...new Set(ids.map(m => m![1] ? `Q${Number(m![1])}` : `심화${Number(m![2])}`))] };
  }
  if (action === 'answer') {
    // Comments show revision-wide numbers (Q3), while Q-hex IDs from older comments keep working.
    const [first, ...more] = parseAnswers(args) ?? [];
    if (first) return { action, ...first, ...(more.length ? { more } : {}) };
  }
  return null;
}
