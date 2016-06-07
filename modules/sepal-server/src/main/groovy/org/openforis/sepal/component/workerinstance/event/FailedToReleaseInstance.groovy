package org.openforis.sepal.component.workerinstance.event

import org.openforis.sepal.event.Event
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData(knownImmutableClasses = [Exception])
class FailedToReleaseInstance implements Event {
    String instanceId
    Exception exception
}
