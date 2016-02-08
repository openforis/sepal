package org.openforis.sepal.hostingservice

interface HostingService {
    WorkerInstanceProvider getWorkerInstanceProvider()

    final class Factory {
        static HostingService create(String name) {
            Class.forName("org.openforis.sepal.hostingservice.${name}.${name.capitalize()}").newInstance() as HostingService
        }
    }
}
