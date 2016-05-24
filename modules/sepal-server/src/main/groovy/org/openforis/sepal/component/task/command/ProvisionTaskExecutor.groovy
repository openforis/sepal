package org.openforis.sepal.component.task.command

import groovy.transform.Immutable
import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.Instance
import org.openforis.sepal.component.task.InstanceProvisioner
import org.openforis.sepal.component.task.State
import org.openforis.sepal.component.task.TaskRepository

@Immutable
class ProvisionTaskExecutor extends AbstractCommand<Void> {
    Instance instance
}

class ProvisionTaskExecutorHandler implements CommandHandler<Void, ProvisionTaskExecutor> {
    private final TaskRepository taskRepository
    private final InstanceProvisioner instanceProvisioner

    ProvisionTaskExecutorHandler(TaskRepository taskRepository, InstanceProvisioner instanceProvisioner) {
        this.taskRepository = taskRepository
        this.instanceProvisioner = instanceProvisioner
    }

    Void execute(ProvisionTaskExecutor command) {
        instanceProvisioner.provision(command.instance)
        taskRepository.updateStateForInstance(command.instance.id, State.PROVISIONING)
        return null
    }
}


