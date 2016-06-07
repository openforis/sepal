package org.openforis.sepal.component.workersession.event

import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.event.Event
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class WorkerSessionActivated implements Event {
    WorkerSession session
}
