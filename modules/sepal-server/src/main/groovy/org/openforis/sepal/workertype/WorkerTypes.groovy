package org.openforis.sepal.workertype

import groovy.transform.Immutable

final class WorkerTypes {
    private final Map<String, WorkerType> workerTypeByName = [:]

    WorkerTypes() {
        workerTypeByName['TASK_EXECUTOR'] = new WorkerType('task-executor', 'openforis/task-executor',
                new WorkerType.Endpoint(endpoint: 'task-executor', exposedPort: 80, publishedPort: 1234)
        )
        workerTypeByName['SANDBOX'] = new WorkerType('sandbox', 'openforis/sandbox',
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
    private final Map<String, Integer> publishedPortByEndpoint
    private final Map<Integer, Integer> exposedPortByPublishedPort

    WorkerType(String id, String imageName, Endpoint... endpoints) {
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

    @Immutable
    static class Endpoint {
        String endpoint
        int publishedPort
        int exposedPort
    }

}

