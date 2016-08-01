package org.openforis.sepal.workertype

import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.util.annotation.ImmutableData

final class WorkerTypes {
    static final String SANDBOX = 'sandbox'
    static final String TASK_EXECUTOR = 'task-executor'
    static final List<HttpEndpoint> SANDBOX_HTTP_ENDPOINTS = [
            new HttpEndpoint(name: 'rstudio-server', port: 8787),
            new HttpEndpoint(name: 'shiny-server', port: 3838)
    ]
    static final Map<String, Factory> FACTORIES = [
            (SANDBOX)      : new SandboxFactory(),
            (TASK_EXECUTOR): new TaskExecutorFactory()
    ]

    static WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config) {
        def factory = FACTORIES[id]
        if (!factory)
            throw new IllegalStateException('There exist no worker type with id ' + id)
        factory.create(id, instance, config)
    }

    private static class TaskExecutorFactory implements Factory {
        WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config) {
            def publishedPorts = [(1026): 1026]
            new WorkerType(TASK_EXECUTOR, [
                    new Image(
                            name: 'task-executor',
                            exposedPorts: [1026],
                            publishedPorts: publishedPorts,
                            runCommand: [
                                    '/script/init_container.sh',
                                    instance.reservation.username,
                                    config.sepalHost,
                                    config.ldapHost,
                                    config.ldapPassword,
                                    config.sepalUser,
                                    config.sepalPassword
                            ],
                            waitCommand: [
                                    "/script/wait_until_initialized.sh",
                                    publishedPorts.values().join(';'),
                                    instance.reservation.username
                            ])
            ])
        }
    }

    private static class SandboxFactory implements Factory {
        WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config) {
            def publishedPorts = [(222): 22, (8787): 8787, (3838): 3838]
            new WorkerType(SANDBOX, [
                    new Image(
                            name: 'sandbox',
                            exposedPorts: [22, 8787, 3838],
                            publishedPorts: publishedPorts,
                            volumes: ['/data/sepal/shiny': '/shiny'],
                            runCommand: [
                                    '/script/init_container.sh',
                                    instance.reservation.username,
                                    config.sepalHost,
                                    config.ldapHost,
                                    config.ldapPassword,
                                    config.sepalUser,
                                    config.sepalPassword
                            ],
                            waitCommand: [
                                    "/script/wait_until_initialized.sh",
                                    publishedPorts.values().join(';'),
                                    instance.reservation.username
                            ]
                    )
            ])
        }
    }

    private interface Factory {
        WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config)
    }
}

@ImmutableData
final class WorkerType {
    final String id
    final List<Image> images = []
}

@ImmutableData
final class Image {
    String name
    List<Integer> exposedPorts = []
    Map<Integer, Integer> publishedPorts = [:]
    Map<String, String> volumes = [:]

    Map<String, String> environment = [:]
    List<String> runCommand = []
    List<String> waitCommand = []

}

@ImmutableData
final class HttpEndpoint {
    String name
    int port
}
