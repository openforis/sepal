package org.openforis.sepal.component.task

interface TaskExecutorGateway {
    void execute(Task task, Instance instance)

    void cancel(Task task, Instance instance)
}
