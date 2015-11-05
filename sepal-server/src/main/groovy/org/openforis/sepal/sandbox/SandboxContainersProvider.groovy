package org.openforis.sepal.sandbox

import org.openforis.sepal.user.UserRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface SandboxContainersProvider {

    SandboxData obtain( String username )

    Boolean isRunning( String containerId )

    Boolean release ( String containerId )

}

class DockerContainersProvider implements SandboxContainersProvider{

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final DockerClient dockerClient
    private final UserRepository userRepo

    DockerContainersProvider(DockerClient dockerClient, UserRepository userRepo){
        this.dockerClient = dockerClient
        this.userRepo = userRepo
    }

    @Override
    SandboxData obtain(String username) {
        LOG.debug("Going to ask a container for $username sandbox")
        return dockerClient.createContainer(username,userRepo.getUserUid(username))
    }

    @Override
    Boolean release(String containerId) {
        def released = false
        if( isRunning(containerId)){
            LOG.debug("Going to terminate container $containerId")
            released = dockerClient.releaseContainer(containerId)
        }else{
            LOG.warn("Container $containerId is not running. Nothing will be terminated")
        }
        return released
    }

    @Override
    Boolean isRunning(String containerId) {
        return dockerClient.isContainerRunning(containerId)
    }
}