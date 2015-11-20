package org.openforis.sepal.sandbox

import org.openforis.sepal.instance.Instance
import org.openforis.sepal.user.UserRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface SandboxContainersProvider {

    SandboxData obtain(String username, Instance instance)

    Boolean isRunning(SandboxData sandboxData)

    Boolean release(SandboxData sandboxData)

}

class DockerContainersProvider implements SandboxContainersProvider {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final DockerClient dockerClient
    private final UserRepository userRepo

    DockerContainersProvider(DockerClient dockerClient, UserRepository userRepo) {
        this.dockerClient = dockerClient
        this.userRepo = userRepo
    }

    @Override
    SandboxData obtain(String username, Instance instance) {
        LOG.debug("Going to ask a container for $username sandbox")
        return dockerClient.createContainer(username, userRepo.getUserUid(username),instance)
    }

    @Override
    Boolean release(SandboxData sandboxData) {
        def released = false
        if (isRunning(sandboxData)) {
            LOG.debug("Going to terminate container $sandboxData.containerId")
            released = dockerClient.releaseContainer(sandboxData)
        } else {
            LOG.warn("Container $sandboxData.containerId is not running. Nothing will be terminated")
        }
        return released
    }

    @Override
    Boolean isRunning(SandboxData sandbox) {
        return dockerClient.isContainerRunning(sandbox)
    }
}