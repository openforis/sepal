package org.openforis.sepal.component.workerinstance.event

import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.event.Event
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData(knownImmutableClasses = [Exception])
class FailedToRequestInstance implements Event {
    String workerType
    String instanceType
    Exception exception
}
