package org.openforis.sepal.component.workersession.event

import groovy.transform.Immutable
import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.event.Event

@Immutable
class WorkerSessionActivated implements Event {
    WorkerSession session
}
