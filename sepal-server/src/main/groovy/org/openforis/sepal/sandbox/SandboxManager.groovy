package org.openforis.sepal.sandbox

import org.openforis.sepal.user.UserRepository
import org.slf4j.Logger
import org.slf4j.LoggerFactory

interface SandboxManager {

    Sandbox obtain(String userName);

    def release(String userName);

}

class DockerSandboxManager implements  SandboxManager{

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final UserRepository userRepository
    private final DockerClient dockerClient
    private final String sandboxName

    DockerSandboxManager(UserRepository userRepository, DockerClient dockerClient, String sandboxName){
        this.userRepository = userRepository
        this.dockerClient = dockerClient
        this.sandboxName = sandboxName
    }

    @Override
    Sandbox obtain(String userName) {
        def sandboxId = getRegisteredSanbox(userName)
        def sandbox
        if (sandboxId){
            LOG.debug("$userName sandboxId is $sandboxId")
            sandbox = dockerClient.getSandbox(sandboxId)
            if (sandbox){
                LOG.debug("$sandbox.name detected")
                if (sandbox.state.running){
                    LOG.info("Found a running sandbox for the user $userName. Going to reuse it")
                    sandbox.uri = userRepository.getSandboxURI(userName)
                }else{
                    releaseSandbox(userName,sandboxId)
                    sandbox = createSandbox(userName)
                }
            }else{
                sandbox = createSandbox(userName)
            }
        }else{
            sandbox = createSandbox(userName)
        }
        return sandbox
    }

    private String getRegisteredSanbox(String username){
        userRepository.getSandboxId(username)
    }

    private Sandbox createSandbox(String userName){
        LOG.info("A new container is goint to be created for $userName")
        Sandbox sandbox = dockerClient.createSandbox(sandboxName,userName)
        if (sandbox){
            userRepository.update(userName,sandbox.id,sandbox.uri)
        }

        return sandbox
    }

    private void releaseSandbox(String userName,String sandboxId){
        def dockerSandbox = dockerClient.getSandbox(sandboxId)
        if (dockerSandbox){
            if (dockerSandbox.state.running){
                dockerClient.stopSandbox(sandboxId)
            }
            dockerClient.releaseSandbox(sandboxId)
        }
        userRepository.update(userName,null,null)
    }

    @Override
    def release(String userName) {
        String sandboxId = getRegisteredSanbox(userName)
        if (sandboxId){
            releaseSandbox(userName,sandboxId)
        }
    }
}