import { tokenizeMatcherValue } from './auto-match';
import type { ReferencePoolRow, UnitTableMatchRule, UnitTableRow } from './monthly-payments';

type RecommendationUnit = Pick<
  UnitTableRow,
  'label' | 'expectedAmount' | 'expectedReference' | 'matchKeywords' | 'matchRules'
>;

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toUpperCase();
}

function roomLabelHints(label: string) {
  const normalized = normalize(label);
  const digits = normalized.replace(/\D/g, '');
  const hints = new Set<string>();
  if (normalized) hints.add(normalized);
  if (digits) {
    hints.add(digits);
    hints.add(`ROOM ${digits}`);
    hints.add(`ROOM${digits}`);
    hints.add(`NO.${digits}`);
    hints.add(`NO ${digits}`);
  }
  return Array.from(hints);
}

function tokenListMatches(value: string, matcherValue: string) {
  const normalized = normalize(value);
  return tokenizeMatcherValue(matcherValue).some((token) => normalized.includes(token));
}

function matchesRule(rule: UnitTableMatchRule, reference: ReferencePoolRow) {
  const referenceText = normalize(reference.reference);
  const payerText = normalize(reference.payerName);
  const matcherTokens = tokenizeMatcherValue(rule.matcherValue);

  switch (rule.matcherType) {
    case 'reference_equals':
      return matcherTokens.some((token) => referenceText === token);
    case 'reference_contains':
      return matcherTokens.some((token) => referenceText.includes(token));
    case 'payer_name_contains':
      return matcherTokens.some((token) => payerText.includes(token));
    case 'amount_equals':
      return rule.amountValue !== null && Math.abs(reference.amount - rule.amountValue) <= 0.001;
    case 'reference_regex':
      if (!rule.matcherValue.trim()) return false;
      try {
        return new RegExp(rule.matcherValue, 'iu').test(reference.reference);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function scoreReferenceForUnit(row: RecommendationUnit, reference: ReferencePoolRow) {
  let score = 0;
  const referenceText = normalize(reference.reference);
  const expectedTokens = tokenizeMatcherValue(row.expectedReference);

  if (expectedTokens.some((token) => referenceText === token)) score += 120;
  else if (expectedTokens.some((token) => referenceText.includes(token))) score += 90;

  for (const keyword of [...row.matchKeywords, ...roomLabelHints(row.label)]) {
    if (tokenListMatches(reference.reference, keyword)) score += 24;
    if (tokenListMatches(reference.payerName ?? '', keyword)) score += 18;
  }

  for (const rule of row.matchRules) {
    if (!rule.isActive || !matchesRule(rule, reference)) continue;
    switch (rule.matcherType) {
      case 'reference_equals':
        score += 110;
        break;
      case 'reference_regex':
        score += 72;
        break;
      case 'payer_name_contains':
        score += 38;
        break;
      case 'amount_equals':
        score += 34;
        break;
      case 'reference_contains':
      default:
        score += 52;
        break;
    }
  }

  if (Math.abs(reference.amount - row.expectedAmount) <= 0.001) score += 35;
  else if (reference.amount > 0 && row.expectedAmount > 0) {
    const variance = Math.abs(reference.amount - row.expectedAmount) / row.expectedAmount;
    if (variance <= 0.1) score += 10;
  }
  return score;
}

export function sortReferencesForUnit(row: RecommendationUnit, references: ReferencePoolRow[]) {
  return references
    .map((reference) => ({ reference, score: scoreReferenceForUnit(row, reference) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.reference.transactionDate < right.reference.transactionDate ? 1 : -1;
    });
}
