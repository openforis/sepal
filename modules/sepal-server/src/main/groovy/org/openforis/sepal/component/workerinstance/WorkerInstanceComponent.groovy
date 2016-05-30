package org.openforis.sepal.component.workerinstance

import org.openforis.sepal.component.AbstractComponent
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.command.ReleaseInstance
import org.openforis.sepal.component.workerinstance.command.ReleaseInstanceHandler
import org.openforis.sepal.component.workerinstance.command.RequestInstance
import org.openforis.sepal.component.workerinstance.command.RequestInstanceHandler
import org.openforis.sepal.event.HandlerRegistryEventDispatcher
import org.openforis.sepal.util.Clock

import javax.sql.DataSource

class WorkerInstanceComponent extends AbstractComponent {
    WorkerInstanceComponent(
            DataSource dataSource,
            HandlerRegistryEventDispatcher eventDispatcher,
            InstanceProvider instanceProvider,
            InstanceProvisioner instanceProvisioner,
            Clock clock) {
        super(dataSource, eventDispatcher)

        command(RequestInstance, new RequestInstanceHandler(instanceProvider))
        command(ReleaseInstance, new ReleaseInstanceHandler(instanceProvider))
    }
}
