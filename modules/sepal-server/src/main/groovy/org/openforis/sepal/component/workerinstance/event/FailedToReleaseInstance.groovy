package org.openforis.sepal.component.workerinstance.event

import groovy.transform.Immutable
import org.openforis.sepal.event.Event

@Immutable(knownImmutables = ['exception'])
class FailedToReleaseInstance implements Event {
    String instanceId
    Exception exception
}
