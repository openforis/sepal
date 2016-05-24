package org.openforis.sepal.component.task.command

import org.openforis.sepal.command.AbstractCommand
import org.openforis.sepal.command.CommandHandler
import org.openforis.sepal.component.task.InstanceProvider
import org.openforis.sepal.component.task.InstanceProvisioner
import org.openforis.sepal.component.task.TaskRepository

import static org.openforis.sepal.component.task.Instance.State.*

class ReleasedUnusedInstances extends AbstractCommand<Void> {
}

class ReleasedUnusedInstancesHandler implements CommandHandler<Void, ReleasedUnusedInstances> {
    private final TaskRepository taskRepository
    private final InstanceProvider instanceProvider
    private final InstanceProvisioner instanceProvisioner

    ReleasedUnusedInstancesHandler(
            TaskRepository taskRepository,
            InstanceProvider instanceProvider,
            InstanceProvisioner instanceProvisioner) {
        this.taskRepository = taskRepository
        this.instanceProvider = instanceProvider
        this.instanceProvisioner = instanceProvisioner
    }

    Void execute(ReleasedUnusedInstances command) {
        def instances = instanceProvider.allTaskExecutors().findAll {
            it.state in [STARTING, PROVISIONING, ACTIVE]
        }
        def unusedInstances = taskRepository.unusedInstances(instances)
        unusedInstances.each {
            instanceProvisioner.reset(it)
            instanceProvider.release(it.id)
        }
        return null
    }
}
