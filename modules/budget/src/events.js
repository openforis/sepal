import {Subject} from 'rxjs'

const userBudgetExceeded$ = new Subject()
const userBudgetCleared$ = new Subject()

export const BUDGET_PUBLISHERS = [
    {key: 'budget.UserBudgetExceeded', publish$: userBudgetExceeded$},
    {key: 'budget.UserBudgetCleared', publish$: userBudgetCleared$}
]

export const emitUserBudgetExceeded = (username, reason, dataQuotaExceeded) =>
    userBudgetExceeded$.next({username, reason, dataQuotaExceeded})
export const emitUserBudgetCleared = username => userBudgetCleared$.next({username})

// budgetCommands' checkers call these on every over-budget user, but nothing subscribes to them,
// so they stay no-ops rather than real events.
export const emitUserInstanceBudgetExceeded = _userInstanceSpending => {}
export const emitUserStorageSpendingExceeded = _userStorageUse => {}
export const emitUserStorageQuotaExceeded = _userStorageUse => {}
