// What a user over one of their budget limits is told, by the budget module's reason for the limit.
export const BUDGET_EXCEEDED_MESSAGES = {
    INSTANCE_BUDGET: 'You have spent more than you have been allocated on instances. Please contact a system administrator to increase your allocation.',
    STORAGE_BUDGET: 'You have spent more than you have been allocated on storage. Please contact a system administrator to increase your allocation.',
    STORAGE_QUOTA: 'You have used up more storage than you are allocated. Please contact a system administrator to increase your allocation.',
    DATA_QUOTA: 'You have used up more Data than you are allocated. Please contact a system administrator to increase your allocation.',
}

// An unknown limit is still a refusal: the worker refuses it as the instance budget.
export const budgetExceededMessage = limit =>
    BUDGET_EXCEEDED_MESSAGES[limit] ?? BUDGET_EXCEEDED_MESSAGES.INSTANCE_BUDGET
