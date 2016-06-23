package org.openforis.sepal.taskexecutor.api

interface BackgroundExecutor {
    TaskExecution execute(TaskExecutor taskExecutor)
}