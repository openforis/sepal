package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.UserStorageUse
import org.openforis.sepal.component.budget.event.UserStorageQuotaExceeded
import org.openforis.sepal.component.budget.event.UserStorageQuotaNotExceeded
import org.openforis.sepal.component.budget.event.UserStorageSpendingExceeded
import org.openforis.sepal.component.budget.event.UserStorageSpendingNotExceeded
import org.openforis.sepal.component.budget.internal.StorageUseService
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class CheckUserStorageUse extends AbstractCommand<UserStorageUse> {
}

class CheckUserStorageUseHandler implements CommandHandler<UserStorageUse, CheckUserStorageUse> {
    private final StorageUseService storageUseService
    private final BudgetRepository budgetRepository
    private final EventDispatcher eventDispatcher

    CheckUserStorageUseHandler(
            StorageUseService storageUseService,
            BudgetRepository budgetRepository,
            EventDispatcher eventDispatcher) {
        this.storageUseService = storageUseService
        this.budgetRepository = budgetRepository
        this.eventDispatcher = eventDispatcher
    }

    @SuppressWarnings("GroovyConditionalWithIdenticalBranches")
    UserStorageUse execute(CheckUserStorageUse command) {
        def storageUse = storageUseService.storageUseForThisMonth(command.username)
        def spending = storageUseService.calculateSpending(storageUse)
        def budget = budgetRepository.userBudget(command.username)
        def userStorageUse = new UserStorageUse(
                username: command.username,
                spending: spending,
                use: storageUse.gb,
                budget: budget.storageSpending,
                quota: budget.storageQuota
        )
        def spendingEvent = spending > budget.storageSpending ?
                new UserStorageSpendingExceeded(userStorageUse) :
                new UserStorageSpendingNotExceeded(userStorageUse)
        eventDispatcher.publish(spendingEvent)

        def budgetEvent = storageUse.gb > budget.storageQuota ?
                new UserStorageQuotaExceeded(userStorageUse) :
                new UserStorageQuotaNotExceeded(userStorageUse)
        eventDispatcher.publish(budgetEvent)

        return userStorageUse
    }
}
