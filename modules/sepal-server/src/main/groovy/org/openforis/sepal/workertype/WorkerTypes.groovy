package org.openforis.sepal.workertype

import groovy.transform.Immutable
import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.util.Terminal

final class WorkerTypes {
    static final String SANDBOX = 'sandbox'
    static final String TASK_EXECUTOR = 'task-executor'
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
            def taskExecutorPublishedPorts = [(1026): 1026]
            def username = instance.reservation.username
            def userHome = "$config.userHomes/${username}" as String
            def userTmp = tempDir(instance, config)
            def eePrivateKey = config.googleEarthEnginePrivateKey.replaceAll(
                    '\n', '-----LINE BREAK-----')
            def task = new Image(
                    name: 'task',
                    exposedPorts: [1026],
                    publishedPorts: taskExecutorPublishedPorts,
                    volumes: [
                            (userHome): "/home/${username}",
                            (userTmp) : ["/tmp", "/home/${username}/tmp"]
                    ],
                    environment: [
                            GOOGLE_PROJECT_ID_SEPAL_KEY   : config.googleProjectId,
                            GOOGLE_REGION_SEPAL_KEY       : config.googleRegion,
                            EE_ACCOUNT_SEPAL_ENV          : config.googleEarthEngineAccount,
                            EE_PRIVATE_KEY_SEPAL_ENV      : eePrivateKey,
                            SEPAL_HOST_SEPAL_ENV          : config.sepalHost,
                            SEPAL_ADMIN_PASSWORD_SEPAL_ENV: config.sepalPassword,
                            USERNAME_SEPAL_ENV            : username,
                    ],
                    waitCommand: ["/script/wait_until_initialized.sh"]
            )
            new WorkerType(TASK_EXECUTOR, [task])
        }
    }

    private static class SandboxFactory implements Factory {
        WorkerType create(String id, WorkerInstance instance, WorkerInstanceConfig config) {
            def publishedPorts = [(222): 22, (8787): 8787, (3838): 3838, (8888): 8888]
            def username = instance.reservation.username
            def userHome = "$config.userHomes/${username}" as String
            def userTmp = tempDir(instance, config)
            def ldapPem = '/data/sepal/certificates/ldap-ca.crt.pem'
            new WorkerType(SANDBOX, [
                    new Image(
                            name: 'sandbox',
                            exposedPorts: [22, 8787, 3838, 8888],
                            publishedPorts: publishedPorts,
                            volumes: [
                                    '/data/sepal/shiny' : '/shiny',
                                    '/data/sepal/shared': "/home/${username}/shared",
                                    (userHome)          : "/home/${username}",
                                    (userTmp)           : ["/tmp", "/home/${username}/tmp"],
                                    (ldapPem)           : "/etc/ldap/certificates/ldap-ca.crt.pem"],
                            runCommand: [
                                    '/script/init_container.sh',
                                    username,
                                    config.sepalHost,
                                    config.ldapHost,
                                    config.ldapPassword,
                                    config.sepalUser,
                                    config.sepalPassword
                            ],
                            waitCommand: [
                                    "/script/wait_until_initialized.sh",
                                    publishedPorts.values().join(';'),
                                    username
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
        return "$config.userHomes/${username}/tmp/$instance.id" as String
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

