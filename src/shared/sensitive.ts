export const SENSITIVE_HINT = "No passwords or banking details here.";
export const SENSITIVE_ERROR =
  "This looks like a password, card number or bank detail. Remove it: the dashboard never stores those.";

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const KEYWORD_PATTERNS: RegExp[] = [
  /\b(pass(word|wd|code|phrase)?|pwd|pin)\s*[:=]/i,
  /\b(login|log-in|username)\s*(and|&|\/)\s*pass/i,
  /\bacc(ount|t)?\.?\s*(no|num|number|#)\b/i,
  /\bbranch\s*code\b/i,
  /\b(iban|swift|bic)\s*[:=#]/i,
  /\b(cvv|cvc)\b/i,
  /\bbank\s*details?\s*[:=]/i,
  /\bexpiry\s*[:=]?\s*\d{2}\s*\/\s*\d{2}\b/i,
];

/** Returns a reason string when the text looks like it holds a secret or banking detail, else null. */
export function sensitiveReason(text: string): string | null {
  if (!text) return null;
  for (const re of KEYWORD_PATTERNS) {
    if (re.test(text)) return "keyword";
  }
  const runs = text.match(/\d[\d -]{11,}\d/g) ?? [];
  for (const run of runs) {
    const digits = run.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return "card-number";
  }
  return null;
}

export function containsSensitive(text: string): boolean {
  return sensitiveReason(text) !== null;
}
