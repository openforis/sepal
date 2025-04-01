package org.openforis.sepal.component.workerinstance.adapter

import groovy.json.JsonOutput
import groovy.transform.ToString
import groovyx.net.http.RESTClient
import org.openforis.sepal.component.hostingservice.api.InstanceType
import org.openforis.sepal.component.workerinstance.WorkerInstanceConfig
import org.openforis.sepal.component.workerinstance.api.InstanceProvisioner
import org.openforis.sepal.component.workerinstance.api.WorkerInstance
import org.openforis.sepal.util.Is
import org.openforis.sepal.workertype.Image
import org.openforis.sepal.workertype.WorkerType
import org.openforis.sepal.workertype.WorkerTypes
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON

@ToString
class DockerInstanceProvisioner implements InstanceProvisioner {

    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final double MIN_HOST_RAM_GiB = 0.3
    private final WorkerInstanceConfig config
    private final Map<String, InstanceType> instanceTypeById
    private final String syslogAddress

    DockerInstanceProvisioner(WorkerInstanceConfig config, List<InstanceType> instanceTypes, String syslogAddress) {
        this.config = config
        this.instanceTypeById = instanceTypes.collectEntries { [(it.id): it] }
        this.syslogAddress = syslogAddress
    }

    void provisionInstance(WorkerInstance instance) {
        waitUntilDockerIsAvailable(instance)
        deleteExistingContainers(instance)
        def workerType = workerType(instance)
        workerType.images.each { image ->
            createContainer(instance, image)
            startContainer(instance, image)
        }
        workerType.images.each { image ->
            waitUntilInitialized(instance, image)
        }
    }

    boolean isProvisioned(WorkerInstance instance) {
        try {
            def workerType = workerType(instance)
            workerType.images.each { image ->
                waitUntilInitialized(instance, image)
            }
        } catch (Exception e) {
            LOG.warn("$instance not provisioned: $e.message")
            return false
        }
        LOG.debug("$instance is provisioned: $instance")
        return true
    }

    void undeploy(WorkerInstance instance) {
        deleteExistingContainers(instance)
    }

    private void createContainer(WorkerInstance instance, Image image) {
        // TODO: Getting warning: Specifying a kernel memory limit is deprecated and will be removed in a future release., Your kernel does not support kernel memory limit capabilities or the cgroup is not mounted. Limitation discarded.
        def memoryBytes = (instanceTypeById[instance.type].ramGiB * Math.pow(10, 9) - MIN_HOST_RAM_GiB * Math.pow(10, 9)) as long
        def instanceType = instanceTypeById[instance.type]
        def logConfig = syslogAddress
                ? [
                    'Type': 'syslog',
                    'Config': [
                            'syslog-address': syslogAddress,
                            'tag': 'worker-docker/{{.Name}}'
                    ]
                ]
                : null
        def body = toJson(
                Image: "$config.dockerRegistryHost/openforis/$image.name:$config.sepalVersion",
                Tty: true,
                Cmd: image.runCommand,
                HostConfig: [
                        Binds: image.volumes.collect { hostDir, mountedDirs ->
                            if (!(mountedDirs instanceof List)) {
                                mountedDirs = [mountedDirs]
                            }
                            return mountedDirs.collect {
                                "$hostDir:$it"
                            }
                        }.flatten(),
                        PortBindings: image.publishedPorts.collectEntries { publishedPort, exposedPort ->
                            ["$exposedPort/tcp", [[HostPort: "$publishedPort"]]]
                        },
                        Links: image.links.collect { "$it.key:$it.value" },
                        Tmpfs: ['/ram': "rw,exec,nosuid,size=${(long) instanceType.ramBytes / 2}"],
                        LogConfig: logConfig,
                        Devices: (instanceType.devices ?: []).collect {
                            [PathOnHost: it, PathInContainer: it, CgroupPermissions: 'mrw']
                        },
                        // Memory: memoryBytes,
                        // MemorySwap: memoryBytes,
                        // KernelMemory: memoryBytes,
                        ShmSize: (long) instanceType.ramBytes / 2,
                // PidMode: 'host' // Exposes all host pids in container. Makes nvidia-smi pick up GPU processes
                ],
                NetworkingConfig: [
                    EndpointsConfig: [
                        sepal: [:]
                    ]
                ],
                ExposedPorts: image.exposedPorts.collectEntries {
                    ["$it/tcp", [:]]
                },
                Env: image.environment.collect {
                    "$it.key=$it.value"
                }
        )
        def request = [
                path: 'containers/create',
                query: [name: image.containerName(instance)],
                body: body,
                requestContentType: JSON
        ]
        LOG.debug("Creating container from image $image on instance $instance with request $request")
        withClient(instance) {
            def response = post(request)
            if (response.data.Warnings) {
                LOG.warn("Warning when creating docker container on $instance: $response.data.Warnings")
            }
        }
        LOG.debug("Created container from image $image on instance $instance")
    }

    private void startContainer(WorkerInstance instance, Image image) {
        def request = [
                path: "containers/${image.containerName(instance)}/start",
                requestContentType: JSON
        ]
        LOG.debug("Starting container from image $image on instance $instance with request $request")
        withClient(instance) {
            post(request)
        }
        LOG.debug("Started container from image $image on instance $instance")
    }

    private void waitUntilInitialized(WorkerInstance instance, Image image) {
        LOG.debug("Waiting until container initialized: Image $image on instance $instance")
        withClient(instance) {
            client.params.setParameter('http.connection.timeout', new Integer(5 * 1000))
            client.params.setParameter('http.socket.timeout', new Integer(5 * 1000))
            LOG.debug("POST to 'containers/${image.containerName(instance)}/exec' for image $image on instance $instance")
            def response = post(
                    path: "containers/${image.containerName(instance)}/exec",
                    body: new JsonOutput().toJson([
                            AttachStdin: false,
                            AttachStdout: true,
                            AttachStderr: true,
                            Tty: false,
                            Cmd: image.waitCommand
                    ]),
                    requestContentType: JSON
            )
            def execId = response.data.Id
            LOG.debug("POST to 'exec/$execId/start' for image $image on instance $instance")
            def startResponse = post(
                    path: "exec/$execId/start",
                    body: new JsonOutput().toJson([Detach: false, Tty: true]),
                    requestContentType: JSON
            )
            LOG.debug("Waiting output:\n${startResponse.data}")
            LOG.debug("Container initialized: Image $image on instance $instance")
        }
    }

    private WorkerType workerType(WorkerInstance instance) {
        def workerType = WorkerTypes.create(instance.reservation.workerType, instance, config)
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
        LOG.debug("Deleting container $containerId from instance $instance")
        withClient(instance) {
            delete(path: "containers/$containerId", query: [force: true])
        }
        LOG.debug("Deleted container $containerId from instance $instance")
    }

    private void waitUntilDockerIsAvailable(WorkerInstance instance) {
        def retries = 60
        for (int i = 0; i < retries; i++)
            try {
            LOG.debug("Trying to connect to Docker on instance $instance")
            deployedContainers(instance)
            LOG.info("Successfully connected to Docker on instance $instance")
            return
            } catch (Exception ignore) {
            LOG.warn("Failed to connect to Docker on instance $instance")
            Thread.sleep(1000)
            }
        throw new Failed(instance, "Unable to connect to docker on instance: $instance")
    }

    @SuppressWarnings('GrDeprecatedAPIUsage')
    private List deployedContainers(WorkerInstance instance) {
        withClient(instance) {
            client.params.setParameter('http.connection.timeout', new Integer(5 * 1000))
            client.params.setParameter('http.socket.timeout', new Integer(5 * 1000))
            def response = get(path: 'containers/json', query: [all: true])
            def allContainers = response.data
            return allContainers.findAll {
                it.Names.find { String name -> name.endsWith('.worker') }
            }
        }
    }

    private String toJson(Map<String, Object> map) {
        new JsonOutput().toJson(map)
    }

    private <T> T withClient(
            WorkerInstance instance,
            @DelegatesTo(RESTClient) Closure<T> callback) {
        withClient(instance.host, callback)
            }

    private <T> T withClient(String host, @DelegatesTo(RESTClient) Closure<T> callback) {
        def client = new RESTClient("http://$host:$config.dockerPort/$config.dockerEntryPoint/")
        LOG.debug("Connecting client: http://$host:$config.dockerPort/$config.dockerEntryPoint/")
        client.parser.'application/vnd.docker.raw-stream' = client.parser.'text/plain'
        try {
            callback.delegate = client
            return callback.call()
        } finally {
            client.shutdown()
        }
    }

}
