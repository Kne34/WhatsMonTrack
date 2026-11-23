/** Category codes used by the parser, the dashboard and budgets. */
export const CATEGORIES = ['FOOD', 'TRANSPORT', 'SHOPPING', 'BILLS', 'HEALTH', 'ENTERTAINMENT', 'INCOME', 'OTHER'] as const;

/** Categories an expense can have (everything but INCOME), e.g. for a settled talangan. */
export const SPENDING_CATEGORIES = CATEGORIES.filter((c) => c !== 'INCOME');

/**
 * The old lending/debt category. Lending and debt now live on the Utang-piutang page, so this code is
 * refused for regular transactions (it would not be counted anywhere).
 */
export const REMOVED_DEBT_CATEGORY = 'DEBT';
