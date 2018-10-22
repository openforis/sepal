package org.openforis.sepal.component.budget.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.UserInstanceSpending
import org.openforis.sepal.component.budget.event.UserInstanceBudgetExceeded
import org.openforis.sepal.component.budget.event.UserInstanceBudgetNotExceeded
import org.openforis.sepal.component.budget.internal.InstanceSpendingService
import org.openforis.sepal.event.EventDispatcher

@EqualsAndHashCode(callSuper = true)
@Canonical
class CheckUserInstanceSpending extends AbstractCommand<UserInstanceSpending> {
}

class CheckUserInstanceSpendingHandler implements CommandHandler<UserInstanceSpending, CheckUserInstanceSpending> {
    private final InstanceSpendingService instanceSpendingService
    private final BudgetRepository budgetRepository
    private final EventDispatcher eventDispatcher

    CheckUserInstanceSpendingHandler(
        InstanceSpendingService instanceSpendingService,
        BudgetRepository budgetRepository,
        EventDispatcher eventDispatcher) {
        this.instanceSpendingService = instanceSpendingService
        this.budgetRepository = budgetRepository
        this.eventDispatcher = eventDispatcher
    }

    UserInstanceSpending execute(CheckUserInstanceSpending command) {
        def instanceSpending = instanceSpendingService.instanceSpending(command.username)
        def budget = budgetRepository.userBudget(command.username)
        def userInstanceSpending = new UserInstanceSpending(
            username: command.username,
            spending: instanceSpending,
            budget: budget.instanceSpending
        )
        //noinspection GroovyConditionalWithIdenticalBranches - TODO: Remove when IDEA-152085 is resolved
        def event = instanceSpending > budget.instanceSpending ?
            new UserInstanceBudgetExceeded(userInstanceSpending) :
            new UserInstanceBudgetNotExceeded(userInstanceSpending)
        eventDispatcher.publish(event)
        return userInstanceSpending
    }
}
