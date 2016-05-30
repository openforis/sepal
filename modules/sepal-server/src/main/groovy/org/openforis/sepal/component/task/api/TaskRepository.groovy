package org.openforis.sepal.component.task.api

interface TaskRepository {
    void insert(Task task)

    void update(Task task)

    Task getTask(String taskId)

    void remove(Task task)

    void removeNonPendingOrActiveUserTasks(String username)

    List<Task> pendingOrActiveTasksInSession(String sessionId)

    List<Task> userTasks(String username)

    List<Task> pendingOrActiveUserTasks(String username)

    List<Task> timedOutTasks()
}