package org.openforis.sepal.component.workerinstance.event

import groovy.transform.Immutable
import org.openforis.sepal.event.Event

@Immutable(knownImmutableClasses = [Exception])
class FailedToRequestInstance implements Event {
    String workerType
    String instanceType
    Exception exception
}
