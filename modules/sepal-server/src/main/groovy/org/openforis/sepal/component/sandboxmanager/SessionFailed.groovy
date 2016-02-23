package org.openforis.sepal.component.sandboxmanager

import groovy.transform.ToString


@ToString
class SessionFailed extends RuntimeException {
    final SandboxSession session

    SessionFailed(SandboxSession session, String reason) {
        super(reason)
        this.session = session
    }

    SessionFailed(SandboxSession session, Exception e) {
        super(e)
        this.session = session
    }
}
