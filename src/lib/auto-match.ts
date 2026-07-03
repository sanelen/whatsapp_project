/**
 * Auto-match: re-runnable matching of imported references to units
 * (owner request 2026-07-02).
 *
 * Decision rules:
 * - Matching may be automatic; SIGN-OFF NEVER IS. An auto-matched row lands as
 *   pending/partial/overpaid and still needs the operator.
 * - Only an UNAMBIGUOUS hit auto-matches: every active rule that fires must
 *   point at the same unit. If rules fire for two different units, the
 *   reference stays in the pool as "needs review" — the drawer's ranked
 *   candidates are the "approve this one / not that one" surface.
 *
 * Pure logic (no Supabase) so functional tests can pin the ambiguity rules.
 */

export type AutoMatchHint = {
  id: string;
  unit_id: string | null;
  property_id: string | null;
  matcher_type: 'reference_contains' | 'reference_equals' | 'reference_regex' | 'payer_name_contains' | 'amount_equals';
  matcher_value: string;
  amount_value: number | string | null;
  priority: number;
  is_active: boolean;
};

export type AutoMatchReference = {
  id: string;
  property_id: string | null;
  reference: string;
  payerName: string;
  amount: number;
};

export type AutoMatchResolution =
  | { kind: 'match'; unitId: string; hintId: string }
  | { kind: 'ambiguous'; unitIds: string[] }
  | { kind: 'none' };

function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Rule values are comma/space separated token lists (that's how the operator
 * writes them in the room manager, e.g. "Room15,QHROOM15 ,15 QH15").
 * Tokens shorter than 4 characters are dropped — "01" or "QH" would fire on
 * half the bank statement.
 */
export function tokenizeMatcherValue(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((token) => normalize(token))
        .filter((token) => token.length >= 4)
    )
  );
}

export type HintHit = {
  /** Longest matching token — the specificity measure. */
  token: string;
  /** Whole reference equals the token exactly (strongest possible signal). */
  exact: boolean;
};

export function hintHit(reference: AutoMatchReference, hint: AutoMatchHint): HintHit | null {
  if (hint.matcher_type === 'reference_contains') {
    const haystack = normalize(reference.reference);
    let best: HintHit | null = null;
    for (const token of tokenizeMatcherValue(hint.matcher_value)) {
      if (!haystack.includes(token)) continue;
      const exact = haystack === token;
      if (!best || token.length > best.token.length || (exact && !best.exact)) {
        best = { token, exact };
      }
    }
    return best;
  }
  if (hint.matcher_type === 'reference_equals') {
    return normalize(reference.reference) === normalize(hint.matcher_value)
      ? { token: normalize(hint.matcher_value), exact: true }
      : null;
  }
  if (hint.matcher_type === 'reference_regex') {
    try {
      return new RegExp(hint.matcher_value, 'i').test(reference.reference)
        ? { token: normalize(reference.reference), exact: false }
        : null;
    } catch {
      return null;
    }
  }
  if (hint.matcher_type === 'payer_name_contains') {
    const payer = normalize(reference.payerName);
    if (!payer) return null;
    for (const token of tokenizeMatcherValue(hint.matcher_value)) {
      if (payer.includes(token)) return { token, exact: false };
    }
    return null;
  }
  if (hint.matcher_type === 'amount_equals') {
    // Amount alone is a weak signal — it supports another hit but never wins
    // on its own (token length 0 loses every dominance comparison).
    return Number(hint.amount_value ?? NaN) === reference.amount ? { token: '', exact: false } : null;
  }
  return null;
}

/**
 * Dominance resolution:
 * 1. An EXACT hit (whole reference equals a token) wins outright — unless two
 *    different units both hit exactly, which is operator territory.
 * 2. Otherwise the unit with the strictly longest matching token wins
 *    ("QHROOM15" beats "QHROOM1"). Equal-length hits on different units are
 *    ambiguous and stay in the pool for review.
 */
export function resolveAutoMatch(reference: AutoMatchReference, hints: AutoMatchHint[]): AutoMatchResolution {
  const hitsByUnit = new Map<string, { hintId: string; token: string; exact: boolean }>();

  for (const hint of hints) {
    if (!hint.is_active || !hint.unit_id) continue;
    if (reference.property_id && hint.property_id && hint.property_id !== reference.property_id) continue;
    const hit = hintHit(reference, hint);
    if (!hit) continue;
    const existing = hitsByUnit.get(hint.unit_id);
    if (!existing || hit.token.length > existing.token.length || (hit.exact && !existing.exact)) {
      hitsByUnit.set(hint.unit_id, { hintId: hint.id, token: hit.token, exact: hit.exact });
    }
  }

  const entries = Array.from(hitsByUnit.entries()).filter(([, hit]) => hit.exact || hit.token.length > 0);
  if (entries.length === 0) return { kind: 'none' };
  if (entries.length === 1) {
    return { kind: 'match', unitId: entries[0][0], hintId: entries[0][1].hintId };
  }

  const exactEntries = entries.filter(([, hit]) => hit.exact);
  if (exactEntries.length === 1) {
    return { kind: 'match', unitId: exactEntries[0][0], hintId: exactEntries[0][1].hintId };
  }
  if (exactEntries.length > 1) {
    return { kind: 'ambiguous', unitIds: exactEntries.map(([unitId]) => unitId) };
  }

  const sorted = entries.slice().sort((left, right) => right[1].token.length - left[1].token.length);
  if (sorted[0][1].token.length > sorted[1][1].token.length) {
    return { kind: 'match', unitId: sorted[0][0], hintId: sorted[0][1].hintId };
  }
  return { kind: 'ambiguous', unitIds: entries.map(([unitId]) => unitId) };
}
