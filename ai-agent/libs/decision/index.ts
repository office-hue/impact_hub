export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ReasoningTier = 'quick' | 'standard' | 'deep' | 'expert';

export interface DecisionContext {
  risk: RiskLevel;
  confidence?: number;          // 0..1, ha ismert
  expectedTokens?: number;      // becsült token költség
  maxTokenBudget?: number;      // elérhető token keret
  requireHumanForHighRisk?: boolean;
}

export interface DecisionOutcome {
  tier: ReasoningTier;
  humanApprovalRequired: boolean;
  degradedForBudget: boolean;
}

/**
 * Alap tier-választási logika a kockázat és költség alapján.
 * - low  -> quick/standard (budgettől függően)
 * - med  -> standard
 * - high -> deep
 * - critical -> expert
 */
export function chooseReasoningTier(ctx: DecisionContext): ReasoningTier {
  const { risk, expectedTokens, maxTokenBudget } = ctx;

  // Ha nincs budget, válts alacsonyabb tierre
  if (maxTokenBudget !== undefined && expectedTokens !== undefined && expectedTokens > maxTokenBudget) {
    return risk === 'low' ? 'quick' : 'standard';
  }

  switch (risk) {
    case 'low':
      return (expectedTokens ?? 0) > 2000 ? 'standard' : 'quick';
    case 'medium':
      return 'standard';
    case 'high':
      return 'deep';
    case 'critical':
      return 'expert';
    default:
      return 'standard';
  }
}

/**
 * Eldönti, kell-e emberi jóváhagyás a kockázat/konfidencia alapján.
 */
export function shouldRequireHumanApproval(ctx: DecisionContext): boolean {
  const { risk, confidence, requireHumanForHighRisk } = ctx;
  // Kritikus esetek mindig jóváhagyást igényelnek
  if (risk === 'critical') return true;
  // High risk: default szerint igen, hacsak kifejezetten nem tiltjuk
  if (risk === 'high') return requireHumanForHighRisk !== false;
  // Közepes/alacsony: ha nagyon alacsony a konfidencia, kérjünk embert
  if (confidence !== undefined && confidence < 0.35) return true;
  return false;
}

/**
 * Összefoglaló döntés: választott tier + jóváhagyási igény + budget degradáció jelzése.
 */
export function buildDecision(ctx: DecisionContext): DecisionOutcome {
  const tier = chooseReasoningTier(ctx);
  const humanApprovalRequired = shouldRequireHumanApproval(ctx);
  const degradedForBudget =
    ctx.maxTokenBudget !== undefined &&
    ctx.expectedTokens !== undefined &&
    ctx.expectedTokens > ctx.maxTokenBudget &&
    (tier === 'quick' || tier === 'standard');

  return { tier, humanApprovalRequired, degradedForBudget };
}
