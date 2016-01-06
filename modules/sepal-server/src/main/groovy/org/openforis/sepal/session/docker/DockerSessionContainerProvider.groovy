package org.openforis.sepal.session.docker

import org.openforis.sepal.instance.Instance
import org.openforis.sepal.session.SessionContainerProvider
import org.openforis.sepal.session.model.SepalSession
import org.openforis.sepal.user.User
import org.openforis.sepal.user.UserRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

class DockerSessionContainerProvider implements SessionContainerProvider {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final DockerClient dockerClient
    private final UserRepository userRepo

    DockerSessionContainerProvider(DockerClient dockerClient, UserRepository userRepo) {
        this.dockerClient = dockerClient
        this.userRepo = userRepo
    }

    @Override
    SepalSession obtain(User user, Instance instance) {
        LOG.debug("Going to ask a container for $user sandbox")
        return dockerClient.createContainer(user?.username, user?.userUid, instance)
    }

    @Override
    Boolean release(SepalSession sandboxData) {
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
    Boolean isRunning(SepalSession sandbox) {
        return dockerClient.isContainerRunning(sandbox)
    }
}
