package org.openforis.sepal.taskexecutor.api

interface BackgroundExecutor {
    TaskExecution execute(Task task, TaskExecutor taskExecutor)
}