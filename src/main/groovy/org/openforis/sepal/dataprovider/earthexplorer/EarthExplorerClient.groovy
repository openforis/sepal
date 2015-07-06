package org.openforis.sepal.dataprovider.earthexplorer

import groovy.json.JsonOutput
import groovyx.net.http.RESTClient
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.dataprovider.SceneReference
import org.openforis.sepal.dataprovider.SceneRequest
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON

interface EarthExplorerClient {
    void download(SceneRequest sceneRequest, Closure callback)
}

class RestfulEarthExplorerClient implements EarthExplorerClient {

    private static final Logger LOG = LoggerFactory.getLogger(this)

    private RESTClient restClient
    private String defaultURI
    private String loginUsername
    private String loginPassword

    RestfulEarthExplorerClient() {
        LOG.trace("New EarthExplorerClient created")
        SepalConfiguration configuration = SepalConfiguration.instance
        defaultURI = configuration.earthExplorerRestEndpoint
        loginUsername = configuration.earthExplorerUsername
        loginPassword = configuration.earthExplorerPassword
        restClient = new RESTClient(defaultURI)
        LOG.info("EarthExplorerClient created. URI: $defaultURI")
    }


    public void download(SceneRequest sceneRequest, Closure callback) {
        def token = null
        InputStream stream = null
        try {
            token = login()
            def directLink = getSceneDirectLinks(sceneRequest, token)
            URL url = new URL(directLink)
            stream = url.openStream()
            callback(stream)
        } finally {
            if (token) {
                logout(token)
            }
            stream?.closeQuietly()
        }
    }


    def login() {
        def authToken
        String qs = "jsonRequest=" + this.encode("{\"username\":\"$loginUsername\",\"password\":\"$loginPassword\"}")
        try {
            def response = restClient.get(
                    path: 'login',
                    requestContentType: JSON,
                    queryString: qs
            )
            def error = response.data.error
            if (error) {
                throw new RuntimeException("Error while trying to login", error)
            }
            authToken = response.data.data
        } catch (Exception ex) {
            throw new RuntimeException("Error while trying to login", ex)
        }
        return authToken
    }

    String getSceneDirectLinks(SceneRequest sceneRequest, String token) {
        def ret
        SceneReference sceneReference = sceneRequest.sceneReference
        def mapParams = [
                datasetName: sceneReference.dataSet.name,
                entityIds  : [sceneReference.id],
                apiKey     : token,
                products   : ['STANDARD'],
                node       : 'EE'
        ]
        String jsonRequest = new JsonOutput().toJson(mapParams)
        String qs = "jsonRequest=" + this.encode(jsonRequest)
        try {
            def response = restClient.get(
                    path: 'download',
                    requestContentType: JSON,
                    queryString: qs
            )
            def error = response.data.error
            if (error) {
                throw new RuntimeException("Error while trying to request direct links to download scenes. errorMessage: $error")
            }
            ret = response.data.data
        } catch (Exception ex) {
            throw new RuntimeException("Error while trying to request direct links to download scenes", ex)
        }
        return ret
    }

    def logout(String token) {
        String qs = "jsonRequest=" + this.encode("{\"apiKey\":\"$token\"}")
        def response = restClient.get(
                path: "logout",
                requestContentType: JSON,
        )
        return response.data.data
    }

    private encode(def qs) {
        URLEncoder.encode(qs, "UTF-8")
    }


}
