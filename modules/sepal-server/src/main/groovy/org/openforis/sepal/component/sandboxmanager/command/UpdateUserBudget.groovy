package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.UserBudgetRepository

@ToString
class UpdateUserBudget extends AbstractCommand<Void> {
    int monthlyInstanceBudget = 0
}

@ToString
class UpdateUserBudgetHandler implements CommandHandler<Void, UpdateUserBudget> {
    private final UserBudgetRepository userBudgetRepository

    UpdateUserBudgetHandler(UserBudgetRepository userBudgetRepository) {
        this.userBudgetRepository = userBudgetRepository
    }

    Void execute(UpdateUserBudget command) {
        userBudgetRepository.update(command.username, command.monthlyInstanceBudget)
        return null
    }
}
