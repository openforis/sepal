package org.openforis.sepal.component.workerinstance.api

interface InstanceProvisioner {
    void provisionInstance(WorkerInstance instance)

    void undeploy(WorkerInstance instance)

    static class Failed extends RuntimeException {
        private final WorkerInstance instance

        Failed(WorkerInstance instance, String message) {
            super(message)
            this.instance = instance
        }
    }
}
