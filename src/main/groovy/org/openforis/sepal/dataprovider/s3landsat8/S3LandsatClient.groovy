package org.openforis.sepal.dataprovider.s3landsat8

import groovyx.net.http.HttpResponseException
import groovyx.net.http.RESTClient
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import static groovyx.net.http.ContentType.BINARY
import static groovyx.net.http.Method.GET

interface S3LandsatClient {
    /**
     * Get the list of files in the scene with provided id. If scene doesn't exist, an empty list is returned.
     * Failures are logged and treated like a non-existing scene.
     */
    SceneIndex index(String sceneId)

    void download(SceneIndex.Entry entry, Closure callback)
}

class RestfulS3LandsatClient implements S3LandsatClient {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final RESTClient s3
    private final String baseUrl

    RestfulS3LandsatClient(String baseUrl) {
        this.baseUrl = baseUrl
        s3 = new RESTClient(baseUrl)
    }

    SceneIndex index(String sceneId) {
        try {
            filesInScene(scenePath(sceneId))
        } catch (HttpResponseException e) {
            if (e.response.status != 404)
                LOG.warn("Failed to get Landsat 8 index from S3: ${scenePath(sceneId)}", e)
            return null
        }
    }

    void download(SceneIndex.Entry entry, Closure callback) {
        s3.request(GET, BINARY) { req ->
            uri.base = URI.create(entry.url)

            response.success = { resp, stream ->
                callback(stream)
            }
            response.failure = { resp ->
                // TODO: Handle failure
            }
        }
    }

    private SceneIndex filesInScene(String scenePath) {
        def response = s3.get(path: "${scenePath}index.html")
        new SceneIndex(
                response.data.BODY.UL.LI.collect {
                    new SceneIndex.Entry(
                            it.A.text() as String,
                            absoluteUrl(scenePath, it.A.@href.text() as String),
                            extractSize(it.text() as String)
                    )
                }
        )
    }

    private String absoluteUrl(String scenePath, String relativeUrl) {
        baseUrl + scenePath + relativeUrl
    }

    @SuppressWarnings("GroovyAssignabilityCheck")
    private double extractSize(String text) {
        def m = text =~ /\((.*?)(.)B\)/
        m.find() // TODO: Handle invalid format
        def size = m[0][1] as double
        def unit = m[0][2]
        size *= unit == 'M' ? 1000000 : 1000
        return size
    }


    @SuppressWarnings("GroovyAssignabilityCheck")
    private String scenePath(String sceneId) {
        def matcher = sceneId =~ /...(...)(...).{12}/
        if (!matcher.find())
            throw new IllegalArgumentException("Malformed Landsat 8 id: $sceneId")
        def path = matcher[0][1]
        def row = matcher[0][2]
        return "L8/$path/$row/$sceneId/"
    }
}

