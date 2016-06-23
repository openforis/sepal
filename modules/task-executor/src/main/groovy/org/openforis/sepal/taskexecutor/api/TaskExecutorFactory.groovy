package org.openforis.sepal.taskexecutor.api

interface TaskExecutorFactory {
    TaskExecutor create(Task task)
}
