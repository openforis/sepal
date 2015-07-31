package org.openforis.sepal.sandbox

import groovy.json.JsonOutput
import groovy.json.JsonParserType
import groovy.json.JsonSlurper
import groovyx.net.http.HttpResponseDecorator
import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON

interface DockerClient {


    Sandbox getSandbox(String identifier)

    def releaseSandbox(String sandboxId)

    def createSandbox(String username, String sandboxName)

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
    def createSandbox(String username, String sandboxName) {
        def restClient = new RESTClient(dockerDaemonURI)
        Sandbox sandbox = null
        String containerName = urlEncode(sandboxName  + "_" + username)
        String qs = "name=$containerName"
        def body = new JsonOutput().toJson([Image: sandboxName, Tty: true ])
        try{
            HttpResponseDecorator response = restClient.post(
                    path : 'containers/create',
                    requestContentType: JSON,
                    queryString: qs,
                    body: body
            )
            sandbox = new Sandbox(response.data.Id)
            startContainer(restClient,sandbox.id)
        }catch (HttpResponseException exception){
            LOG.error("Error while creating the sandbox. $exception.message")
            throw exception
        }
        return sandbox
    }

    private void startContainer(RESTClient restClient, String containerId){
        def startPath = "containers/$containerId/start"
        try{
            restClient.post(
                    path : startPath
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