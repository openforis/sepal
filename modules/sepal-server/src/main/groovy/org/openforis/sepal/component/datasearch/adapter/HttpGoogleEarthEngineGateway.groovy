package org.openforis.sepal.component.datasearch.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.datasearch.DataSet
import org.openforis.sepal.component.datasearch.LatLng
import org.openforis.sepal.component.datasearch.Polygon
import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.api.*

import static groovy.json.JsonOutput.toJson
import static groovyx.net.http.ContentType.JSON
import static groovyx.net.http.ContentType.URLENC

class HttpGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final String targetUri

    HttpGoogleEarthEngineGateway(String targetUri) {
        this.targetUri = targetUri
    }

    Collection<SceneArea> findSceneAreasInAoi(DataSet dataSet, Aoi aoi) {
        def response = endpoint.get(
                path: 'sceneareas',
                contentType: JSON,
                query: [dataSet: dataSet.name(), aoi: toJson(aoi.params)]
        )
        return response.data.collect {
            def polygon = it.polygon.size() == 1 ? it.polygon.first() : it.polygon
            new SceneArea(
                    id: it.sceneAreaId,
                    polygon: new Polygon(polygon.collect { new LatLng(it[0].toDouble(), it[1].toDouble()) }))
        }

    }

    MapLayer preview(AutomaticSceneSelectingMapQuery query) {
        def image = [
                type                 : 'automatic',
                dataSet              : query.dataSet.name(),
                aoi                  : query.aoi.params,
                targetDayOfYear      : query.targetDayOfYear,
                targetDayOfYearWeight: query.targetDayOfYearWeight,
                bands                : query.bands,
                sensors              : query.sensors,
                fromDate             : query.fromDate,
                toDate               : query.toDate

        ]
        def response = endpoint.post(
                path: 'preview',
                requestContentType: URLENC,
                contentType: JSON,
                body: [image: toJson(image)])
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }

    MapLayer preview(PreselectedScenesMapQuery query) {
        def image = [
                type                 : 'manual',
                dataSet              : query.dataSet.name(),
                aoi                  : query.aoi.params,
                targetDayOfYear      : query.targetDayOfYear,
                targetDayOfYearWeight: query.targetDayOfYearWeight,
                bands                : query.bands,
                sceneIds             : query.sceneIds
        ]
        def response = endpoint.post(
                path: 'preview',
                requestContentType: URLENC,
                contentType: JSON,
                body: [image: toJson(image)])
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }

    RESTClient getEndpoint() {
        new RESTClient(targetUri)
    }
}
