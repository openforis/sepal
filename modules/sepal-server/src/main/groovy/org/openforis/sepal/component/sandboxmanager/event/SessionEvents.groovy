package org.openforis.sepal.component.sandboxmanager.event

import org.openforis.sepal.component.sandboxmanager.SandboxSession
import org.openforis.sepal.event.Event

abstract class SessionEvent implements Event {
    final SandboxSession session

    SessionEvent(SandboxSession session) {
        this.session = session
    }
}

class SessionCreated extends SessionEvent {
    SessionCreated(SandboxSession session) {
        super(session)
    }
}

class SessionClosed extends SessionEvent {
    SessionClosed(SandboxSession session) {
        super(session)
    }
}


class SessionDeployed extends SessionEvent {
    SessionDeployed(SandboxSession session) {
        super(session)
    }
}



class SessionAlive extends SessionEvent {
    SessionAlive(SandboxSession session) {
        super(session)
    }
}
