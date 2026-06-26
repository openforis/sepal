package org.openforis.sepal.component.hostingservice

import org.openforis.sepal.component.budget.api.HostingService
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workerinstance.api.InstanceProvider
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.SandboxSessionApiKey

interface HostingServiceAdapter {
    List<InstanceType> getInstanceTypes()

    HostingService getHostingService()

    InstanceProvider getInstanceProvider()

    InstanceProvisioner getInstanceProvisioner()

    void setSandboxSessionApiKey(SandboxSessionApiKey apiKey)

    final class Factory {
        static HostingServiceAdapter create(String name, SandboxSessionApiKey apiKey) {
            def adapter = Class.forName(
                    "org.openforis.sepal.component.hostingservice.${name}.${name.capitalize()}"
            ).newInstance() as HostingServiceAdapter
            adapter.setSandboxSessionApiKey(apiKey)
            return adapter
        }
    }
}
