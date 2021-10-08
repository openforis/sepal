package org.openforis.sepal.component.budget.command

import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.BudgetRepository

@EqualsAndHashCode(callSuper = true)
@Canonical
class RequestBudgetUpdate extends AbstractCommand<Void> {
    String message
    Budget budget
}

class RequestBudgetUpdateHandler implements CommandHandler<Void, RequestBudgetUpdate> {
    private final BudgetRepository budgetRepository

    RequestBudgetUpdateHandler(BudgetRepository budgetRepository) {
        this.budgetRepository = budgetRepository
    }

    Void execute(RequestBudgetUpdate command) {
        budgetRepository.requestBudgetUpdate(command.username, command.message, command.budget)
        return null
    }
}
