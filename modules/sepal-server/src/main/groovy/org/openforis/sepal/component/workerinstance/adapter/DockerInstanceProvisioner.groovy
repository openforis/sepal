package org.openforis.sepal.component.workerinstance.adapter

import groovy.json.JsonOutput
import groovy.transform.ToString
import groovyx.net.http.RESTClient
import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.util.Is
import org.openforis.sepal.workertype.Image
import org.openforis.sepal.workertype.WorkerType
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON

@ToString
class DockerInstanceProvisioner implements InstanceProvisioner {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final WorkerInstanceConfig config

    DockerInstanceProvisioner(WorkerInstanceConfig config) {
        this.config = config
    }

    void provisionInstance(WorkerInstance instance) {
        waitUntilDockerIsAvailable(instance)
        deleteExistingContainers(instance)
        def workerType = workerType(instance)
        workerType.images.each { image ->
            createContainer(instance, image)
            startContainer(instance, image)
            waitUntilInitialized(instance, image)
        }
    }

    void undeploy(WorkerInstance instance) {
        deleteExistingContainers(instance)
    }

    private void createContainer(WorkerInstance instance, Image image) {
        def exposedPorts = image.exposedPortByPublishedPort().values()
        def username = instance.reservation.username
        def mountedDirByHostDir = [
                "$config.userHomes/${username}"           : "/home/${username}",
                "/data/sepal/certificates/ldap-ca.crt.pem": "/etc/ldap/certificates/ldap-ca.crt.pem"
        ] + image.mountedDirByHostDir
        def request = toJson([
                Image       : "$config.dockerRegistryHost/openforis/$image.name:$config.sepalVersion",
                Tty         : true,
                Cmd         : [
                        "/script/init_container.sh",
                        username,
                        config.sepalHost,
                        config.ldapHost,
                        config.ldapPassword,
                        config.sepalUser,
                        config.sepalPassword
                ],
                HostConfig  : [
                        Binds: mountedDirByHostDir.collect { hostDir, mountedDir ->
                            "$hostDir:$mountedDir"
                        }
                ],
                ExposedPorts: exposedPorts.collectEntries {
                    ["$it/tcp", [:]]
                }
        ])

        withClient(instance) {
            def response = post(
                    path: "containers/create",
                    query: [name: containerName(instance, image)],
                    body: request,
                    requestContentType: JSON
            )
            if (response.data.Warnings)
                LOG.warn("Warning when creating docker container on $instance: $response.data.Warnings")
        }
    }

    private void startContainer(WorkerInstance instance, Image image) {
        def portBindings = image.exposedPortByPublishedPort()
        def request = toJson(PortBindings: portBindings.collectEntries { publishedPort, exposedPort ->
            ["$exposedPort/tcp", [[HostPort: "$publishedPort"]]]
        })
        withClient(instance) {
            post(
                    path: "containers/${containerName(instance, image)}/start",
                    body: request,
                    requestContentType: JSON
            )
        }
    }

    private void waitUntilInitialized(WorkerInstance instance, Image image) {
        def portsToWaitFor = image.exposedPortByPublishedPort().values().toList()
        LOG.debug("Waiting for container to be initialized on ports $portsToWaitFor. Instance: $instance")
        withClient(instance) {
            def response = post(
                    path: "containers/${containerName(instance, image)}/exec",
                    body: new JsonOutput().toJson([
                            AttachStdin : false,
                            AttachStdout: true,
                            AttachStderr: true,
                            Tty         : false,
                            Cmd         : ["/script/wait_until_initialized.sh", portsToWaitFor.join(';'), instance.reservation.username]
                    ]),
                    requestContentType: JSON
            )
            def execId = response.data.Id
            def startResponse = post(
                    path: "exec/$execId/start",
                    body: new JsonOutput().toJson([Detach: false, Tty: true]),
                    requestContentType: JSON
            )
            LOG.debug("Waiting output:\n${startResponse.data}")
            LOG.debug("Session initialized. Instance: $instance.")
        }
    }

    private String containerName(WorkerInstance instance, Image image) {
        "worker-${image.name}-${instance.reservation.username}"
    }

    private WorkerType workerType(WorkerInstance instance) {
        def workerType = config.workerTypeByName[instance.reservation.workerType]
        Is.notNull(workerType, "No worker type with id ${instance.reservation.workerType}")
        return workerType
    }

    private void deleteExistingContainers(WorkerInstance instance) {
        def containers = deployedContainers(instance)
        containers.each {
            deleteContainer(instance, it.Id)
        }
    }

    private void deleteContainer(WorkerInstance instance, containerId) {
        withClient(instance) {
            delete(path: "containers/$containerId", query: [force: true])
        }
    }

    private void waitUntilDockerIsAvailable(WorkerInstance instance) {
        def retries = 60
        for (int i = 0; i < retries; i++)
            try {
                LOG.debug("Trying to connect to Docker on instance $instance")
                deployedContainers(instance)
                LOG.debug("Successfully connected to Docker on instance $instance")
                return
            } catch (Exception ignore) {
                LOG.debug("Failed to connect to Docker on instance $instance")
                Thread.sleep(1000)
            }
        throw new InstanceProvisioner.Failed(instance, "Unable to connect to docker on instance: $instance")
    }

    @SuppressWarnings("GrDeprecatedAPIUsage")
    private List deployedContainers(WorkerInstance instance) {
        withClient(instance) {
            client.params.setParameter('http.connection.timeout', new Integer(5 * 1000))
            client.params.setParameter('http.socket.timeout', new Integer(5 * 1000))
            def response = get(path: 'containers/json')
            def allContainers = response.data
            return allContainers.findAll {
                it.Names.find { String name -> name.startsWith('/worker-') }
            }
        }
    }

    private String toJson(LinkedHashMap<String, Object> map) {
        new JsonOutput().toJson(map)
    }

    private <T> T withClient(
            WorkerInstance instance,
            @DelegatesTo(RESTClient) Closure<T> callback) {
        withClient(instance.host, callback)
    }

    private <T> T withClient(String host, @DelegatesTo(RESTClient) Closure<T> callback) {
        def client = new RESTClient("http://$host:$config.dockerPort/$config.dockerEntryPoint/")
        client.parser.'application/vnd.docker.raw-stream' = client.parser.'text/plain'
        try {
            callback.delegate = client
            return callback.call()
        } finally {
            client.shutdown()
        }
    }
}
