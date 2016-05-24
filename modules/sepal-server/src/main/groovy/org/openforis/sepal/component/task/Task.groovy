package org.openforis.sepal.component.task

import groovy.transform.Immutable

@Immutable
final class Task {
    String operation
    Map data = [:]
}
