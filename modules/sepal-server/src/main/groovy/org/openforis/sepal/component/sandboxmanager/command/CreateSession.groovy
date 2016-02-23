package org.openforis.sepal.component.sandboxmanager.command

import groovy.transform.ToString
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.component.sandboxmanager.SessionManager
import org.openforis.sepal.event.EventDispatcher

@ToString
class CreateSession extends AbstractCommand<SandboxSession> {
    String instanceType
}

@ToString
class CreateSessionHandler implements CommandHandler<SandboxSession, CreateSession> {
    private final SessionManager sessionManager

    CreateSessionHandler(SessionManager sessionManager) {
        this.sessionManager = sessionManager
    }

    SandboxSession execute(CreateSession command) {
        sessionManager.create(command.username, command.instanceType)
    }
}