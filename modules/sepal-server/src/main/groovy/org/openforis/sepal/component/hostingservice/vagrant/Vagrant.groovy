package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.hostingservice.internal.InstanceType
import org.openforis.sepal.component.workerinstance.api.InstanceProvider

class Vagrant implements HostingServiceAdapter {
    private final config = new VagrantConfig('/data/vagrant.properties')
    private final double storageCostPerGbMonth = 0.3d
    private final List<InstanceType> instanceTypes = [
            new InstanceType(id: 'vagrant-box', name: 'Vagrant Box', description: 'Only supports one session at a time', hourlyCost: 0)
    ]

    HostingService getHostingService() {
        return new VagrantHostingService(instanceTypes, storageCostPerGbMonth, config.userHomeDirTemplate)
    }

    InstanceProvider getInstanceProvider() {
        return new VagrantInstanceProvider()
    }
}
