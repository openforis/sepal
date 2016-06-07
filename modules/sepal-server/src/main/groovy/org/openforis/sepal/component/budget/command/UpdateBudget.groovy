package org.openforis.sepal.component.budget.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.budget.api.Budget
import org.openforis.sepal.component.budget.api.BudgetRepository
import org.openforis.sepal.util.annotation.Data

@Data(callSuper = true)
class UpdateBudget extends AbstractCommand<Void> {
    Budget budget
}

class UpdateBudgetHandler implements CommandHandler<Void, UpdateBudget> {
    private final BudgetRepository budgetRepository

    UpdateBudgetHandler(BudgetRepository budgetRepository) {
        this.budgetRepository = budgetRepository
    }

    Void execute(UpdateBudget command) {
        if (command.username)
            budgetRepository.updateBudget(command.username, command.budget)
        else
            budgetRepository.updateDefaultBudget(command.budget)
        return null
    }
}
