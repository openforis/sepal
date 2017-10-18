package org.openforis.sepal.component.hostingservice.local

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance

@SuppressWarnings("GroovyUnusedDeclaration")
class Local implements HostingServiceAdapter {
    private final config = new LocalConfig()
    private final double storageCostPerGbMonth = 0.33d
    final List<InstanceType> instanceTypes = [
            new InstanceType(
                    id: 'local',
                    name: 'Dummy instance',
                    cpuCount: 2,
                    ramGiB: 2,
                    hourlyCost: 0.1d
            )
    ].asImmutable()

    HostingService getHostingService() {
        return new LocalHostingService(instanceTypes, storageCostPerGbMonth, config.userHomeDirTemplate)
    }

    InstanceProvider getInstanceProvider() {
        return new LocalInstanceProvider(config.host, instanceTypes.first())
    }

    InstanceProvisioner getInstanceProvisioner() {
        new InstanceProvisioner() {
            void provisionInstance(WorkerInstance instance) {
                // TODO: Get race-condition if provisioning is too fast
                Thread.sleep(1000)
            }

            void undeploy(WorkerInstance instance) {}

            boolean isProvisioned(WorkerInstance instance) {
                return true
            }
        }
    }
}
