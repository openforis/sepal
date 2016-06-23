package org.openforis.sepal.taskexecutor.api

class TaskFailed extends RuntimeException {
    final Task task

    TaskFailed(Task task, String message) {
        super(message)
        this.task = task
    }
}
