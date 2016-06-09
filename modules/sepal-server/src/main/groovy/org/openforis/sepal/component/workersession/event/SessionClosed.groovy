package org.openforis.sepal.component.workersession.event

import org.openforis.sepal.event.Event
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class SessionClosed implements Event {
    String sessionId
}
