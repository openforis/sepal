package org.openforis.sepal.component.task.event

import org.openforis.sepal.component.workersession.api.WorkerSession
import org.openforis.sepal.event.Event

class FailedToRequestSession implements Event {
    WorkerSession session
}
