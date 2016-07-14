package org.openforis.sepal.component.datasearch.adapter

import groovyx.net.http.RESTClient
import org.openforis.sepal.component.datasearch.LatLng
import org.openforis.sepal.component.datasearch.Polygon
import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.api.*

import static groovyx.net.http.ContentType.JSON
import static groovyx.net.http.ContentType.URLENC

class HttpGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final RESTClient endpoint

    HttpGoogleEarthEngineGateway(String targetUri) {
        this.endpoint = new RESTClient(targetUri)
    }

    Collection<SceneArea> findSceneAreasInAoi(FusionTableAoi aoi) {
        def response = endpoint.get(path: 'sceneareas', query: [
                fusionTable: aoi.tableName,
                keyColumn  : aoi.keyColumn,
                keyValue   : aoi.keyValue])
        return response.data.collect {
            def polygon = it.polygon.size() == 1 ? it.polygon.first() : it.polygon
            new SceneArea(
                    id: it.sceneAreaId,
                    polygon: new Polygon(polygon.collect { new LatLng(it[0].toDouble(), it[1].toDouble()) }))
        }

    }

    MapLayer preview(AutomaticSceneSelectingMapQuery query) {
        def response = endpoint.post(
                path: 'preview',
                requestContentType: URLENC,
                contentType: JSON,
                body: [
                        fusionTable          : query.aoi.tableName,
                        keyColumn            : query.aoi.keyColumn,
                        keyValue             : query.aoi.keyValue,
                        fromDate             : query.fromDate.time,
                        toDate               : query.toDate.time,
                        sensors              : query.sensors.join(','),
                        targetDayOfYear      : query.targetDayOfYear,
                        targetDayOfYearWeight: query.targetDayOfYearWeight,
                        bands                : query.bands.join(',')
                ])
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }

    MapLayer preview(PreselectedScenesMapQuery query) {
        def response = endpoint.post(
                path: 'preview-scenes',
                requestContentType: URLENC,
                contentType: JSON,
                body: [
                        fusionTable          : query.aoi.tableName,
                        keyColumn            : query.aoi.keyColumn,
                        keyValue             : query.aoi.keyValue,
                        sceneIds             : query.sceneIds.join(','),
                        targetDayOfYear      : query.targetDayOfYear,
                        targetDayOfYearWeight: query.atargetDayOfYearWeight,
                        bands                : query.bands.join(',')
                ])
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }
}
