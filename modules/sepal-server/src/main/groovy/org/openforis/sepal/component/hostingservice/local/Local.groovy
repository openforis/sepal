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
    private final double storageCostPerGbMonth = 0d
    final List<InstanceType> instanceTypes = [
        new InstanceType(
            id: 'local',
            name: 'Dummy instance',
            tag: 'l',
            cpuCount: 2,
            ramGiB: 2,
            hourlyCost: 1d
        ),
        new InstanceType(
            id: 'local_without_tag',
            name: 'Dummy instance without tag',
            cpuCount: 2,
            ramGiB: 2,
            hourlyCost: 1d
        )
    ].asImmutable()

    HostingService getHostingService() {
        return new LocalHostingService(instanceTypes, storageCostPerGbMonth)
    }

    InstanceProvider getInstanceProvider() {
        return new LocalInstanceProvider(config.host, instanceTypes.findAll {it.tag}.first())
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
