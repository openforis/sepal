package org.openforis.sepal.component.workersession.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.workersession.api.BudgetManager

class CloseSessionsForUsersExceedingBudget extends AbstractCommand<Void> {
}

class CloseSessionsForUsersExceedingBudgetHandler implements CommandHandler<Void, CloseSessionsForUsersExceedingBudget> {
    private final BudgetManager budgetManager
    private final CloseUserSessionsHandler closeUserSessionsHandler

    CloseSessionsForUsersExceedingBudgetHandler(BudgetManager budgetManager, CloseUserSessionsHandler closeUserSessionsHandler) {
        this.budgetManager = budgetManager
        this.closeUserSessionsHandler = closeUserSessionsHandler
    }

    Void execute(CloseSessionsForUsersExceedingBudget command) {
        budgetManager.usersExceedingBudget().each {
            closeUserSessionsHandler.execute(new CloseUserSessions(username: it))
        }
        return null
    }
}
