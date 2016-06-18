package org.openforis.sepal.taskexecutor.api

import org.openforis.sepal.taskexecutor.util.annotation.ImmutableData

@ImmutableData
class Task {
    String id
    String operation
    Map params
}
