package org.openforis.sepal.workertype

import org.openforis.sepal.util.annotation.ImmutableData

final class WorkerTypes {
    static final String SANDBOX = 'sandbox'
    static final String TASK_EXECUTOR = 'task-executor'
    private final Map<String, WorkerType> workerTypeByName = [:]

    WorkerTypes() {
        workerTypeByName[TASK_EXECUTOR] = new WorkerType(TASK_EXECUTOR,
                [:],
                new WorkerType.Endpoint(endpoint: 'task-executor', exposedPort: 80, publishedPort: 1234)
        )
        workerTypeByName[SANDBOX] = new WorkerType(SANDBOX,
                ['/data/sepal/shiny': '/shiny'],
                new WorkerType.Endpoint(endpoint: 'rstudio-server', exposedPort: 8787, publishedPort: 8787),
                new WorkerType.Endpoint(endpoint: 'shiny-server', exposedPort: 3838, publishedPort: 3838)
        )
    }

    Map<String, WorkerType> workerTypeByName() {
        Collections.unmodifiableMap(workerTypeByName)
    }
}

final class WorkerType {
    final String id
    final String imageName
    final Map<String, String> mountedDirByHostDir
    private final Map<String, Integer> publishedPortByEndpoint
    private final Map<Integer, Integer> exposedPortByPublishedPort

    WorkerType(String id, Map<String, String> mountedDirByHostDir, Endpoint... endpoints) {
        this.id = id
        this.imageName = "openforis/$id"
        this.mountedDirByHostDir = mountedDirByHostDir.asImmutable()
        this.publishedPortByEndpoint = endpoints.collectEntries {
            [(it.endpoint): it.publishedPort]
        }
        this.exposedPortByPublishedPort = endpoints.collectEntries {
            [(it.publishedPort): it.exposedPort]
        }
    }

    int publishedPortForEndpoint(String endpoint) {
        publishedPortByEndpoint[endpoint]
    }

    boolean containsEndpoint(String endpoint) {
        endpoint in publishedPortByEndpoint.keySet()
    }

    Map<Integer, Integer> exposedPortByPublishedPort() {
        Collections.unmodifiableMap(exposedPortByPublishedPort)
    }

    @ImmutableData
    static class Endpoint {
        String endpoint
        int publishedPort
        int exposedPort
    }

}

