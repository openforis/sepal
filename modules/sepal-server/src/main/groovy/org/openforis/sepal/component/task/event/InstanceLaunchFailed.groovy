package org.openforis.sepal.component.task.event

import groovy.transform.Immutable
import org.openforis.sepal.event.Event

@Immutable(knownImmutableClasses = [Exception])
class InstanceLaunchFailed implements Event {
    String instanceType
    Exception exception
}
