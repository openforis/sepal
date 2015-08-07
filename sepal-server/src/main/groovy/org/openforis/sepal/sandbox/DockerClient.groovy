package org.openforis.sepal.sandbox

import groovy.json.JsonOutput
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON

interface DockerClient {


    Sandbox getSandbox(String identifier)

    def releaseSandbox(String sandboxId)

    def createSandbox(String sandboxName)

    def stopSandbox(String sandboxId)
}

class DockerRESTClient implements DockerClient {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    final def dockerDaemonURI

    DockerRESTClient(def dockerDeamonURI) {
        this.dockerDaemonURI = dockerDeamonURI
    }



    @Override
    Sandbox getSandbox(String identifier) {
        def sandbox = null
        def path = "containers/$identifier/json"
        try{
            HttpResponseDecorator response = restClient.get(
                    path : path
            )
            sandbox = Sandbox.mapToObject(response.data)
        }catch (HttpResponseException responseException){
            if (responseException.statusCode == 404){
                LOG.warn("The registered container $identifier does not exist")
            }else{
                LOG.error("Error while asking information about container $identifier",responseException)
                throw responseException
            }
        }
        return sandbox
    }

    @Override
    def stopSandbox(String sandboxId) {
        def path = "containers/$sandboxId/stop"
        try{
            restClient.post(path : path)
        }catch (HttpResponseException ex){
            LOG.error("Error while stopping container $sandboxId",ex)
            throw ex
        }
    }

    @Override
    def releaseSandbox(String sandboxId) {
        releaseSandbox(sandboxId,restClient)
    }

    def releaseSandbox(String sandboxId, RESTClient restClient){
        def path = "containers/$sandboxId"
        try{
            restClient.delete(
                    path : path
            )
        }catch (HttpResponseException exception){
            LOG.error("Error while deleting container $sandboxId",exception)
            throw exception
        }
    }

    @Override
    def createSandbox(String sandboxName) {
        def restClient = new RESTClient(dockerDaemonURI)
        Sandbox sandbox = null
        def body = new JsonOutput().toJson([Image: sandboxName, Tty: true ])
        try{
            HttpResponseDecorator response = restClient.post(
                    path : 'containers/create',
                    requestContentType: JSON,
                    body: body
            )
            sandbox = new Sandbox(response.data.Id)
            startContainer(restClient,sandbox.id)
            getContainerInfo(restClient,sandbox)
        }catch (HttpResponseException exception){
            LOG.error("Error while creating the sandbox. $exception.message")
            throw exception
        }
        return sandbox
    }

    private void getContainerInfo(RESTClient restClient, Sandbox sandbox){
        try{
            def path = "containers/$sandbox.id/json"
            HttpResponseDecorator response = restClient.get(
                    path : path,
            )
            sandbox.sshPort = Integer.parseInt(response.data.NetworkSettings.Ports["22/tcp"][0].HostPort)
        }catch (HttpResponseException responseException){
            LOG.error("Error while getting container infos. $responseException.message")
            releaseSandbox(sandbox.id,restClient)
            throw responseException
        }
    }

    private void startContainer(RESTClient restClient, String containerId){
        def startPath = "containers/$containerId/start"
        def body =  new JsonOutput().toJson([PublishAllPorts  : true])
        try{
            restClient.post(
                    path : startPath,
                    body : body,
                    requestContentType: JSON
            )
        }catch (HttpResponseException exception){
            LOG.error("Exception while starting the container. Creation will be rollbacked")
            this.releaseSandbox(containerId,restClient)
            throw exception
        }
    }



    private urlEncode(String qs) {
        URLEncoder.encode(qs, "UTF-8")
    }


    private RESTClient getRestClient(){
        return new RESTClient(dockerDaemonURI)
    }
}