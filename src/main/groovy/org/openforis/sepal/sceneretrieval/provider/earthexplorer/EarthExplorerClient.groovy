package org.openforis.sepal.sceneretrieval.provider.earthexplorer

import groovy.json.JsonOutput
import groovyx.net.http.RESTClient
import org.openforis.sepal.SepalConfiguration
import org.openforis.sepal.sceneretrieval.provider.SceneReference
import org.openforis.sepal.sceneretrieval.provider.SceneRequest
import org.openforis.sepal.util.Is
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.JSON

interface EarthExplorerClient {
    void download(SceneRequest sceneRequest, String downloadLink, Closure callback)

    String lookupDownloadLink(SceneRequest sceneRequest)

    double getSceneSize(String sceneUrl)
}

class RestfulEarthExplorerClient implements EarthExplorerClient {
    private static final Logger LOG = LoggerFactory.getLogger(this)

    private String defaultURI


    private String loginUsername
    private String loginPassword

    RestfulEarthExplorerClient() {
        def configuration = SepalConfiguration.instance
        defaultURI = configuration.earthExplorerRestEndpoint
        loginUsername = configuration.earthExplorerUsername
        loginPassword = configuration.earthExplorerPassword
        LOG.info("EarthExplorerClient created. URI: $defaultURI")
    }

    String lookupDownloadLink(SceneRequest sceneRequest) {
        def downloadLink = null
        def token = null
        try {
            token = login()
            downloadLink = getSceneDirectLink(sceneRequest, token)
        } catch (Exception ex) {
            LOG.warn("Could not find $sceneRequest", ex)
        } finally {
            if (token) {
                logout(token)
            }
        }
        return downloadLink
    }


    public void download(SceneRequest sceneRequest, String downloadLink, Closure callback) {
        Is.notNull(downloadLink)
        URL url = new URL(downloadLink)
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        url.withInputStream {
            callback(it, Double.valueOf(con.getHeaderField('Content-Length')))
        }
    }

    @Override
    double getSceneSize(String sceneUrl) {
        HttpURLConnection.setFollowRedirects(false)
        HttpURLConnection con =
                (HttpURLConnection) new URL(sceneUrl).openConnection();
        con.setRequestMethod("HEAD");
        def size = con.getHeaderField('Content-Length')
        return Double.valueOf(size)

    }


    String login() {
        def authToken
        String qs = "jsonRequest=" + this.urlEncode("{\"username\":\"$loginUsername\",\"password\":\"$loginPassword\"}")
        try {
            def response = restClient.get(
                    path: 'login',
                    requestContentType: JSON,
                    queryString: qs
            )
            def errorMessage = response.data.error
            if (errorMessage) {
                throw new RuntimeException("Error while trying to login: $errorMessage")
            }
            authToken = response.data.data
        } catch (Exception ex) {
            throw new RuntimeException("Error while trying to login", ex)
        }
        return authToken
    }

    private String getSceneDirectLink(SceneRequest sceneRequest, String token) {
        def downloadLinks
        SceneReference sceneReference = sceneRequest.sceneReference
        def mapParams = [
                datasetName: sceneReference.dataSet.name(),
                entityIds  : [sceneReference.id],
                apiKey     : token,
                products   : ['STANDARD'],
                node       : 'EE'
        ]
        String jsonRequest = new JsonOutput().toJson(mapParams)
        String qs = "jsonRequest=" + urlEncode(jsonRequest)
        try {
            def response = restClient.get(
                    path: 'download',
                    requestContentType: JSON,
                    queryString: qs
            )

            def responseJson = response.data
            def errorMessage = responseJson.error
            if (errorMessage) {
                throw new RuntimeException("Error while trying to request direct links to download scenes. errorMessage: $errorMessage")
            }
            downloadLinks = responseJson.data as List
        } catch (Exception ex) {
            throw new RuntimeException("Error while trying to request direct links to download scenes", ex)
        }
        return downloadLinks.first()
    }

    def logout(String token) {
        String qs = "jsonRequest=" + this.urlEncode("{\"apiKey\":\"$token\"}")
        def response = restClient.get(
                path: "logout",
                requestContentType: JSON,
                queryString: qs
        )
        return response.data.data
    }

    private urlEncode(String qs) {
        URLEncoder.encode(qs, "UTF-8")
    }

    private getRestClient() {
        return new RESTClient(defaultURI)
    }


}
