package org.openforis.sepal.component.datasearch.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.user.User

import static groovy.json.JsonOutput.toJson
import static groovyx.net.http.ContentType.JSON

class HttpGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final String targetUri

    HttpGoogleEarthEngineGateway(String targetUri) {
        this.targetUri = targetUri
    }

    Collection<SceneArea> findSceneAreasInAoi(String source, Aoi aoi, User user) {
        def response = endpoint.get(
                path: 'sceneareas',
                contentType: JSON,
                query: [source: source, aoi: toJson(aoi.params)],
                headers: ['sepal-user': toJson(user)]
        )
        return response.data.collect {
            def polygon = it.polygon.size() == 1 ? it.polygon.first() : it.polygon
            new SceneArea(
                    id: it.sceneAreaId,
                    polygon: new Polygon(polygon.collect { new LatLng(it[0].toDouble(), it[1].toDouble()) }))
        }

    }

    MapLayer preview(Map image, User user) {
        def response = endpoint.post(
                path: 'preview',
                requestContentType: JSON,
                contentType: JSON,
                body: toJson(image),
                headers: ['sepal-user': toJson(user)]
        )
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }

    RESTClient getEndpoint() {
        new RESTClient(targetUri)
    }
}
