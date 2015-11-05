package org.openforis.sepal.sandbox

import groovy.json.JsonOutput
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
import org.apache.commons.io.IOUtils
import org.openforis.sepal.SepalConfiguration
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON
import static org.openforis.sepal.sandbox.SandboxStatus.ALIVE
import static org.openforis.sepal.sandbox.SandboxStatus.STOPPED

interface DockerClient {

    Boolean releaseContainer( String containerId )
    Boolean isContainerRunning ( String containerId)
    SandboxData createContainer( String username, int userUid)


}

class DockerRESTClient implements DockerClient{

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private final String dockerDaemonURI

    DockerRESTClient( String dockerDaemonURI){
        this.dockerDaemonURI = dockerDaemonURI
    }

    @Override
    SandboxData createContainer(String username, int userUid) {
        def sandboxData
        def userId = 0
        LOG.debug("Going to create a container for $username")
        def settings = collectSettings(username)
        def execResult = exec("gateone", "/keygen/keygen.run", username, "$userUid")
        def generatedKey = IOUtils.toString(execResult as InputStream)
        def body = new JsonOutput().toJson(
                [
                        Image     : settings.imageName,
                        Tty       : true,
                        Cmd       : ["/init_sandbox.run", username, generatedKey, "$userId"],
                        HostConfig: [Binds: [settings.homeBinding, settings.shadowBinding, settings.publicFolderBinding]]
                ]
        )

        LOG.info("Creating container with: $body")
        try {
            HttpResponseDecorator response = restClient.post(
                    path: 'containers/create',
                    requestContentType: JSON,
                    body: body
            )
            sandboxData = new SandboxData(containerId:response.data.Id)
            LOG.debug("Sandbox created: $sandboxData.containerId")
            startContainer(restClient, sandboxData.containerId)
            getContainerInfo(restClient, sandboxData)
            exec(sandboxData.containerId, "/root/healt_check.sh", "$settings.portsToCheck")
        } catch (HttpResponseException exception) {
            LOG.error("Error while creating the sandbox. $exception.message")
            throw exception
        }
        return sandboxData
    }





    @Override
    Boolean isContainerRunning(String containerId) {
        SandboxData data = new SandboxData(containerId: containerId)
        return getContainerInfo(restClient,data).status == RUNNING
    }

    @Override
    Boolean releaseContainer(String containerId) {
        releaseContainer(containerId,restClient)
    }

    Boolean releaseContainer(String containerId, RESTClient restClient){
        try {
            if (isContainerRunning(containerId)){
                stopContainer(containerId)
            }
            restClient.delete(  path: "containers/$containerId" )
        } catch (HttpResponseException exception) {
            LOG.error("Error while deleting container $containerId", exception)
            throw exception
        }
        return true
    }

    private static Map<String,String> collectSettings(String username){
        SepalConfiguration conf = SepalConfiguration.instance
        def configMap = [
                portsToCheck: conf.sandboxPortsToCheck,
                homeBinding: "$conf.mountingHomeDir/$username:/home/$username",
                shadowBinding: "$conf.userCredentialsHomeDir/shadow:/etc/shadow",
                publicFolderBinding: "$conf.publicHomeDir:$conf.publicHomeDir",
                imageName: conf.dockerImageName
        ]
        return configMap
    }


    private void startContainer(RESTClient restClient, String containerId) {
        def startPath = "containers/$containerId/start"
        def body = new JsonOutput().toJson([PublishAllPorts: true])
        try {
            restClient.post(
                    path: startPath,
                    body: body,
                    requestContentType: JSON
            )
        } catch (HttpResponseException exception) {
            LOG.error("Exception while starting the container. Creation will be rollbacked")
            this.releaseContainer(containerId, restClient)
            throw exception
        }
    }


    def private exec(String sandboxId, String... commands) {
        def path = "containers/$sandboxId/exec"
        def params = [AttachStdin: false, AttachStdout: true, AttachStderr: true, Tty: false, Cmd: commands]
        def jsonParams = new JsonOutput().toJson(params)
        def response = restClient.post(path: path, requestContentType: JSON, body: jsonParams)
        def id = response.data.Id
        path = "exec/$id/start"
        params = [Detach: false, Tty: true]
        jsonParams = new JsonOutput().toJson(params)
        response = restClient.post(path: path, requestContentType: JSON, body: jsonParams)
        return response.data
    }

    private SandboxData getContainerInfo(RESTClient restClient, SandboxData containerData) {
        try {
            def path = "containers/$containerData.containerId/json"
            HttpResponseDecorator response = restClient.get(
                    path: path,
            )
            def data = response.data
            containerData.uri = response.data.NetworkSettings.IPAddress
            containerData.status = data.State.Running ? ALIVE : STOPPED
        } catch (HttpResponseException responseException) {
            LOG.error("Error while getting container info. $responseException.message")
            releaseContainer(containerData.containerId, restClient)
            throw responseException
        }
    }


    private void stopContainer(String containerId) {
        def path = "containers/$containerId/stop"
        try {
            restClient.post(path: path)
        } catch (HttpResponseException ex) {
            LOG.error("Error while stopping container $containerId", ex)
            throw ex
        }
    }

    private RESTClient getRestClient() {
        return new RESTClient(dockerDaemonURI)
    }
}