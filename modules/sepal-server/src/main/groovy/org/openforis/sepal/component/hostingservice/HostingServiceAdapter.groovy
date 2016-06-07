package org.openforis.sepal.component.hostingservice

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workersession.api.InstanceType

interface HostingServiceAdapter {
    List<InstanceType> getInstanceTypes()

    HostingService getHostingService()

    InstanceProvider getInstanceProvider()

    final class Factory {
        static HostingServiceAdapter create(String name) {
            Class.forName(
                    "org.openforis.sepal.component.hostingservice.${name}.${name.capitalize()}"
            ).newInstance() as HostingServiceAdapter
        }
    }
}
