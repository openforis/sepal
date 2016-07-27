package org.openforis.sepal.workertype

import org.openforis.sepal.util.annotation.ImmutableData

final class WorkerTypes {
    static final String SANDBOX = 'sandbox'
    static final String TASK_EXECUTOR = 'task-executor'
    private final Map<String, WorkerType> workerTypeByName = [:]

    WorkerTypes() {
        workerTypeByName[TASK_EXECUTOR] = new WorkerType(TASK_EXECUTOR,
                new Image(
                        'task-executor',
                        [:],
                        [],
                        [new Image.Endpoint(endpoint: 'task-executor', exposedPort: 1026, publishedPort: 1026)]
                ))
        workerTypeByName[SANDBOX] = new WorkerType(SANDBOX,
                new Image(
                        'sandbox',
                        ['/data/sepal/shiny': '/shiny'],
                        [new Image.PublishedPort(exposedPort: 22, publishedPort: 222)],
                        [new Image.Endpoint(endpoint: 'rstudio-server', exposedPort: 8787, publishedPort: 8787),
                         new Image.Endpoint(endpoint: 'shiny-server', exposedPort: 3838, publishedPort: 3838)]
                ))
    }

    Map<String, WorkerType> workerTypeByName() {
        Collections.unmodifiableMap(workerTypeByName)
    }
}

final class WorkerType {
    final String id
    final List<Image> images

    WorkerType(String id, Image... images) {
        this.id = id
        this.images = (images as List).asImmutable()
    }
}

final class Image {
    final String name
    final Map<String, String> mountedDirByHostDir
    private final Map<Integer, Integer> exposedPortByPublishedPort

    Image(String name, Map<String, String> mountedDirByHostDir, List<PublishedPort> publishedPorts, List<Endpoint> endpoints) {
        this.name = name
        this.mountedDirByHostDir = mountedDirByHostDir.asImmutable()
        this.exposedPortByPublishedPort = endpoints.collectEntries {
            [(it.publishedPort): it.exposedPort]
        }
        this.exposedPortByPublishedPort.putAll(
                publishedPorts.collectEntries {
                    [(it.publishedPort): it.exposedPort]
                }
        )
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

    @ImmutableData
    static class PublishedPort {
        int publishedPort
        int exposedPort
    }
}
