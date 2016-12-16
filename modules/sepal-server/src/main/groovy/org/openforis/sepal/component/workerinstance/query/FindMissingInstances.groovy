package org.openforis.sepal.component.workerinstance.query

import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

@Data
class FindMissingInstances implements Query<List<WorkerInstance>> {
    List<WorkerInstance> instances
}

class FindMissingInstancesHandler implements QueryHandler<List<WorkerInstance>, FindMissingInstances> {
    private final InstanceProvisioner instanceProvisioner

    FindMissingInstancesHandler(InstanceProvisioner instanceProvisioner) {
        this.instanceProvisioner = instanceProvisioner
    }

    List<WorkerInstance> execute(FindMissingInstances query) {
        return query.instances.findAll {
            !instanceProvisioner.isProvisioned(it)
        }
    }
}
