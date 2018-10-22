package org.openforis.sepal.taskexecutor.api

import groovy.transform.Immutable

@Immutable
class Task {
    String id
    String operation
    Map params
}
