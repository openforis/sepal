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

interface DockerClient {


    Sandbox getSandbox(String identifier)

    def releaseSandbox(String sandboxId)

    def createSandbox(String sandboxName, String username, int userId)

    def stopSandbox(String sandboxId)

    def exec(String sandboxId, String... commands)
}

class DockerRESTClient implements DockerClient {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    final def dockerDaemonURI

    DockerRESTClient(def dockerDeamonURI) {
        this.dockerDaemonURI = dockerDeamonURI
    }

    @Override
    def exec(String sandboxId, String... commands) {
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

    @Override
    Sandbox getSandbox(String identifier) {
        def sandbox = null
        def path = "containers/$identifier/json"
        try {
            HttpResponseDecorator response = restClient.get(
                    path: path
            )
            sandbox = Sandbox.mapToObject(response.data)
        } catch (HttpResponseException responseException) {
            if (responseException.statusCode == 404) {
                LOG.warn("The registered container $identifier does not exist")
            } else {
                LOG.error("Error while asking information about container $identifier", responseException)
                throw responseException
            }
        }
        return sandbox
    }

    @Override
    def stopSandbox(String sandboxId) {
        def path = "containers/$sandboxId/stop"
        try {
            restClient.post(path: path)
        } catch (HttpResponseException ex) {
            LOG.error("Error while stopping container $sandboxId", ex)
            throw ex
        }
    }

    @Override
    def releaseSandbox(String sandboxId) {
        releaseSandbox(sandboxId, restClient)
    }

    def releaseSandbox(String sandboxId, RESTClient restClient) {
        def path = "containers/$sandboxId"
        try {
            restClient.delete(
                    path: path
            )
        } catch (HttpResponseException exception) {
            LOG.error("Error while deleting container $sandboxId", exception)
            throw exception
        }
    }

    @Override
    def createSandbox(String sandboxName, String username, int userId) {
        def restClient = new RESTClient(dockerDaemonURI)
        LOG.debug("Going to create a sandbox on $dockerDaemonURI")

        Sandbox sandbox
        def generatedKey = IOUtils.toString(exec("gateone", "/keygen/keygen.run", username, "$userId"))
        def mountingHomeDir = SepalConfiguration.instance.mountingHomeDir
        def userCredentialHomeDir = SepalConfiguration.instance.userCredentialsHomeDir
        def publicHomeDir = SepalConfiguration.instance.publicHomeDir
        def portsToCheck = SepalConfiguration.instance.sandboxPortsToCheck
        def homeBinding = "$mountingHomeDir/$username:/home/$username"
        def shadowBinding = "$userCredentialHomeDir/shadow:/etc/shadow"
        def publicFolderBinding = "$publicHomeDir:$publicHomeDir"

        def body = new JsonOutput().toJson(
                [
                        Image     : sandboxName,
                        Tty       : true,
                        Cmd       : ["/init_sandbox.run", username, generatedKey, "$userId"],
                        HostConfig: [Binds: [homeBinding, shadowBinding, publicFolderBinding]]
                ]
        )

        LOG.info("Creating sandbox with: $body")
        try {
            HttpResponseDecorator response = restClient.post(
                    path: 'containers/create',
                    requestContentType: JSON,
                    body: body
            )
            sandbox = new Sandbox(response.data.Id)
            LOG.debug("Sandbox created: $sandbox.id")
            startContainer(restClient, sandbox.id)
            getContainerInfo(restClient, sandbox)
            exec(sandbox.id, "/root/healt_check.sh $portsToCheck")
        } catch (HttpResponseException exception) {
            LOG.error("Error while creating the sandbox. $exception.message")
            throw exception
        }
        return sandbox
    }

    private void getContainerInfo(RESTClient restClient, Sandbox sandbox) {
        try {
            def path = "containers/$sandbox.id/json"
            HttpResponseDecorator response = restClient.get(
                    path: path,
            )
            sandbox.uri = response.data.NetworkSettings.IPAddress
        } catch (HttpResponseException responseException) {
            LOG.error("Error while getting container infos. $responseException.message")
            releaseSandbox(sandbox.id, restClient)
            throw responseException
        }
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
            this.releaseSandbox(containerId, restClient)
            throw exception
        }
    }


    private urlEncode(String qs) {
        URLEncoder.encode(qs, "UTF-8")
    }


    private RESTClient getRestClient() {
        return new RESTClient(dockerDaemonURI)
    }
}