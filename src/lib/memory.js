// Long-lived facts about the user that the assistant should remember beyond
// the last few chat messages (age, employer benefits, preferences, plans).
// memory = { id, text, topic, createdAt, updatedAt }
export const MEMORY_TOPICS = ['personal', 'work', 'goals', 'preferences', 'tax', 'other'];
export const MAX_MEMORIES = 60;
const MAX_LENGTH = 200;

// Identifiers that must never be stored: PAN, Aadhaar, card/account numbers.
const SENSITIVE = [
  { re: /\b[A-Z]{5}\d{4}[A-Z]\b/i, what: 'a PAN number' },
  { re: /\b\d{4}\s?\d{4}\s?\d{4}\b/, what: 'an Aadhaar-like number' },
  { re: /\b\d{9,19}\b/, what: 'an account or card number' },
  { re: /\b(password|passcode|pin|otp|cvv)\b/i, what: 'a password or PIN' }
];

// Returns { text, topic } or { error } for text proposed by the model or typed by the user.
export function validateMemory(text, topic) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { error: 'Empty fact' };
  if (clean.length > MAX_LENGTH) return { error: `Keep facts under ${MAX_LENGTH} characters` };
  const hit = SENSITIVE.find((s) => s.re.test(clean));
  if (hit) return { error: `Not stored: it looks like ${hit.what}. Sensitive identifiers are never saved.` };
  return { text: clean, topic: MEMORY_TOPICS.includes(topic) ? topic : 'other' };
}
