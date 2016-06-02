package org.openforis.sepal.component.hostingservice.vagrant

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.api.InstanceProvider

class Vagrant implements HostingServiceAdapter {
    HostingService getHostingService() {
        return new VagrantHostingService()
    }

    InstanceProvider getInstanceProvider() {
        return new VagrantInstanceProvider()
    }
}
