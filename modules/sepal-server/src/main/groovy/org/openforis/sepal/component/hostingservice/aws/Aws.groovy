package org.openforis.sepal.component.hostingservice.aws

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.HostingServiceAdapter
import org.openforis.sepal.component.workerinstance.api.InstanceProvider

class Aws implements HostingServiceAdapter {
    HostingService getHostingService() {
        return new AwsHostingService()
    }

    InstanceProvider getInstanceProvider() {
        return new AwsInstanceProvider()
    }
}
