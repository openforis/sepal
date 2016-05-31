package org.openforis.sepal.component.workerinstance.api

interface InstanceProvisioner {
    void provisionInstance(WorkerInstance instance)

    void undeploy(WorkerInstance instance)
}
