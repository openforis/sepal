package org.openforis.sepal.component.task

import groovy.transform.Immutable

@Immutable
class Task {
    String operation
    Map data = [:]
}
