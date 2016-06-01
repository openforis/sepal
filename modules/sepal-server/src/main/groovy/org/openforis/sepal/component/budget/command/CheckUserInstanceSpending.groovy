package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.component.budget.api.InstanceTypes
import org.openforis.sepal.component.budget.api.UserInstanceSpending
import org.openforis.sepal.component.budget.event.UserInstanceBudgetExceeded
import org.openforis.sepal.component.budget.event.UserInstanceBudgetNotExceeded
import org.openforis.sepal.component.budget.internal.InstanceSpendingCalculator
import org.openforis.sepal.event.EventDispatcher
import org.openforis.sepal.util.Clock
import org.openforis.sepal.util.DateTime

class CheckUserInstanceSpending extends AbstractCommand<UserInstanceSpending> {
}

class CheckUserInstanceSpendingHandler implements CommandHandler<UserInstanceSpending, CheckUserInstanceSpending> {
    private final BudgetRepository budgetRepository
    private final InstanceTypes instanceTypes
    private final EventDispatcher eventDispatcher
    private final Clock clock

    CheckUserInstanceSpendingHandler(
            BudgetRepository budgetRepository,
            InstanceTypes instanceTypes,
            EventDispatcher eventDispatcher,
            Clock clock) {
        this.budgetRepository = budgetRepository
        this.instanceTypes = instanceTypes
        this.eventDispatcher = eventDispatcher
        this.clock = clock
    }

    UserInstanceSpending execute(CheckUserInstanceSpending command) {
        def now = clock.now()
        def year = DateTime.year(now)
        def month = DateTime.monthOfYear(now)
        def instanceUses = budgetRepository.userInstanceUses(command.username, year, month)
        def instanceSpending = new InstanceSpendingCalculator(instanceTypes.hourCostByInstanceType())
                .calculate(year, month, instanceUses)
        def budget = budgetRepository.userBudget(command.username)
        def userInstanceSpending = new UserInstanceSpending(
                username: command.username,
                instanceSpending: instanceSpending,
                instanceBudget: budget.instanceSpending
        )
        //noinspection GroovyConditionalWithIdenticalBranches - TODO: Remove once Intellij IDEA bug resolved
        def event = instanceSpending > budget.instanceSpending ?
                new UserInstanceBudgetExceeded(userInstanceSpending) :
                new UserInstanceBudgetNotExceeded(userInstanceSpending)
        eventDispatcher.publish(event)
        return userInstanceSpending
    }
}
