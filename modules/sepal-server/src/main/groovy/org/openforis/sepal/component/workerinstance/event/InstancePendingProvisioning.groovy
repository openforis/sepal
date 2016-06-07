package org.openforis.sepal.component.workerinstance.event

import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.event.Event
import org.openforis.sepal.util.annotation.ImmutableData

@ImmutableData
class InstancePendingProvisioning implements Event {
    WorkerInstance instance
}
