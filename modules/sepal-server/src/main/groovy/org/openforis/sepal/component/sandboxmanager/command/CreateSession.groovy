package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.BudgetCheck
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionManager

@ToString
class CreateSession extends AbstractCommand<SandboxSession> {
    String instanceType
}

@ToString
class CreateSessionHandler implements CommandHandler<SandboxSession, CreateSession> {
    private final SessionManager sessionManager
    private final BudgetCheck budgetCheck

    CreateSessionHandler(SessionManager sessionManager, BudgetCheck budgetCheck) {
        this.sessionManager = sessionManager
        this.budgetCheck = budgetCheck
    }

    SandboxSession execute(CreateSession command) {
        budgetCheck.verifyBudget(command.username)
        sessionManager.create(command.username, command.instanceType)
    }

}