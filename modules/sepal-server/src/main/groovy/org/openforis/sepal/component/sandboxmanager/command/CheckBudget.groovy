package org.openforis.sepal.component.sandboxmanager.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.BudgetCheck
import org.openforis.sepal.component.sandboxmanager.BudgetCheck.BudgetExceeded
import org.openforis.sepal.user.UserRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class CheckBudget extends AbstractCommand<Void> {
}

class CheckBudgetHandler implements CommandHandler<Void, CheckBudget> {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final UserRepository userRepository
    private final BudgetCheck budgetCheck

    CheckBudgetHandler(UserRepository userRepository, BudgetCheck budgetCheck) {
        this.userRepository = userRepository
        this.budgetCheck = budgetCheck
    }

    Void execute(CheckBudget command) {
        userRepository.eachUsername { String username ->
            try {
                budgetCheck.verifyBudget(username)
            } catch (BudgetExceeded e) {
                LOG.info("Username $username: $e.message")
            }
        }
        return null
    }

}