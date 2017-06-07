package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.hostingservice.api.InstanceType

class Vagrant implements HostingServiceAdapter {
    private final config = new VagrantConfig()
    private final double storageCostPerGbMonth = 0.33d
    final List<InstanceType> instanceTypes = [
            new InstanceType(
                    id: 'vagrant-box',
                    name: 'Vagrant Box',
                    cpuCount: 2,
                    ramGiB: 2,
                    hourlyCost: 0.1d
            )
    ].asImmutable()

    HostingService getHostingService() {
        return new VagrantHostingService(instanceTypes, storageCostPerGbMonth, config.userHomeDirTemplate)
    }

    InstanceProvider getInstanceProvider() {
        return new VagrantInstanceProvider(config.host, instanceTypes.first())
    }
}
