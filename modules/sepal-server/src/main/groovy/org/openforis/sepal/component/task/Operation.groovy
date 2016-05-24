package org.openforis.sepal.component.task

import groovy.transform.Immutable

@Immutable
final class Operation {
    String name
    Map data = [:]
}
