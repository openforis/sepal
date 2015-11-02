package org.openforis.sepal.sandbox

import org.openforis.sepal.user.UserRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

/**
 * Created by ottavio on 02/11/15.
 */
interface SandboxContainersProvider {

    SandboxData obtain( String username )

    Boolean isRunning( String containerId )

    void release ( String containerId )

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
        return dockerClient.createContainer(username,userRepo.getUserUid(username))
    }

    @Override
    void release(String containerId) {
        if( isRunning(containerId)){
            LOG.debug("Going to terminate container $containerId")
            dockerClient.releaseContainer(containerId)
        }else{
            LOG.warn("Container $containerId is not running. Nothing will be terminated")
        }
    }

    @Override
    Boolean isRunning(String containerId) {
        return dockerClient.isContainerRunning(containerId)
    }
}