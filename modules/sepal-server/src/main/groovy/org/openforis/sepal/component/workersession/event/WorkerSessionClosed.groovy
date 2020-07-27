package org.openforis.sepal.component.workersession.event

import groovy.transform.Immutable
import org.openforis.sepal.event.Event

@Immutable
class WorkerSessionClosed implements Event {
    String sessionId
}
