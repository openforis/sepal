package org.openforis.sepal.taskexecutor.api

class InvalidTask extends RuntimeException {
    final Task task

    InvalidTask(Task task, String message) {
        super("$message. Task: $task")
        this.task = task
    }
}