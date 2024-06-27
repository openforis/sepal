package org.openforis.sepal.workertype

import groovy.transform.Immutable
import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.util.Terminal

final class WorkerTypes {
    static final String SANDBOX = 'sandbox'
    static final String TASK_EXECUTOR = 'task-executor'
    static final Map<String, Factory> FACTORIES = [
            (SANDBOX): new SandboxFactory(),
            (TASK_EXECUTOR): new TaskExecutorFactory()
    ]
    static final String USER_HOME_NAME = 'sepal-user'

    static WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config) {
        def factory = FACTORIES[id]
        if (!factory)
            throw new IllegalStateException('There exist no worker type with id ' + id)
        factory.create(id, instance, config)
    }

    private static class TaskExecutorFactory implements Factory {
        WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config) {
            def taskExecutorPublishedPorts = [(1026): 1026]
            def sepalEndpoint = "https://${config.sepalHost}:${config.sepalHttpsPort ?: 443}"
            def username = instance.reservation.username
            def userHome = "${config.sepalHostDataDir}/sepal/home/${username}" as String
            def userTmp = tempDir(instance, config)
            def eePrivateKey = config.googleEarthEnginePrivateKey.replaceAll(
                    '\n', '-----LINE BREAK-----')
            def volumes = [
                (userHome): "/home/${USER_HOME_NAME}",
                (userTmp): ["/tmp", "/home/${USER_HOME_NAME}/tmp"]
            ]
            if (config.deployEnvironment == 'DEV') { // Allow hot-reload of task in DEV
                volumes["${config.sepalHostProjectDir}/modules/task/src"] = '/usr/local/src/sepal/modules/task/src'
                volumes["${config.sepalHostProjectDir}/lib/js/shared/src"] = '/usr/local/src/sepal/lib/js/shared/src'
            }
            def task = new Image(
                    name: 'task',
                    exposedPorts: [1026],
                    publishedPorts: taskExecutorPublishedPorts,
                    volumes: volumes,
                    environment: [
                            GOOGLE_PROJECT_ID: config.googleProjectId,
                            GOOGLE_REGION: config.googleRegion,
                            EE_ACCOUNT: config.googleEarthEngineAccount,
                            EE_PRIVATE_KEY: eePrivateKey,
                            SEPAL_ENDPOINT: sepalEndpoint,
                            SEPAL_ADMIN_PASSWORD: config.sepalPassword,
                            USERNAME: USER_HOME_NAME,
                            NODE_TLS_REJECT_UNAUTHORIZED: config.deployEnvironment == 'DEV' ? 0 : 1,
                            DEPLOY_ENVIRONMENT: config.deployEnvironment,
                            NVIDIA_VISIBLE_DEVICES: 'all',
                            NVIDIA_DRIVER_CAPABILITIES: 'all',
                    ],
                    waitCommand: ["wait_until_initialized.sh"]
            )
            new WorkerType(TASK_EXECUTOR, [task])
        }
    }

    private static class SandboxFactory implements Factory {
        WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config) {
            def publishedPorts = [(222): 22, (8787): 8787, (3838): 3838, (8888): 8888]
            def username = instance.reservation.username
            def userHome = "${config.sepalHostDataDir}/sepal/home/${username}" as String
            def userTmp = tempDir(instance, config)
            def userPublicKey = new File("/var/lib/sepal/user/home/${username}/.ssh/id_rsa.pub").text
            new WorkerType(SANDBOX, [
                    new Image(
                            name: 'sandbox',
                            exposedPorts: [22, 8787, 3838, 8888],
                            publishedPorts: publishedPorts,
                            volumes: [
                                    ("${config.sepalHostDataDir}/sepal/shiny"): '/shiny',
                                    ("${config.sepalHostDataDir}/sepal/shared"): "/home/${USER_HOME_NAME}/shared",
                                    ("${config.sepalHostDataDir}/sepal/jupyter/current-kernels"): "/usr/local/share/jupyter/kernels/",
                                    (userHome): "/home/${USER_HOME_NAME}",
                                    (userTmp): ["/tmp", "/home/${USER_HOME_NAME}/tmp"],
                            ],
                            environment: [
                                    USER_PUBLIC_KEY: userPublicKey,
                                    NVIDIA_VISIBLE_DEVICES: 'all',
                                    NVIDIA_DRIVER_CAPABILITIES: 'all',
                            ],
                            runCommand: [
                                    '/script/init_container.sh',
                            ],
                            waitCommand: [
                                    "/script/wait_until_initialized.sh",
                                    publishedPorts.values().join(';')
                            ]
                    )
            ])
        }
    }

    private interface Factory {
        WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config)
    }

    static String tempDir(instance, config) {
        def username = instance.reservation.username
        def localTmp = "/data/home/$username/tmp/$instance.id" as String
        new File(localTmp).mkdirs()
        Terminal.execute(new File('/'), '/bin/chmod', '1777', localTmp)
        return "$config.sepalHostDataDir/sepal/home/${username}/tmp/$instance.id" as String
    }
}

@Immutable
final class WorkerType {
    final String id
    final List<Image> images = []
}

@Immutable
final class Image {
    String name
    List<Integer> exposedPorts = []
    Map<Integer, Integer> publishedPorts = [:]
    Map<String, String> volumes = [:]
    Map<String, String> links = [:]

    Map<String, String> environment = [:]
    List<String> runCommand = []
    List<String> waitCommand = []

    String containerName(WorkerInstance instance) {
        "${instance.reservation.username}.${name}.worker"
    }
}

