package org.openforis.sepal.component.datasearch

import groovyx.net.http.RESTClient

interface SceneAreaProvider {
    Collection<SceneArea> findSceneAreasInAoi(String fusionTable, String keyColumn, String keyValue)
}

class SceneAreaProviderHttpGateway implements SceneAreaProvider {
    private final RESTClient target

    SceneAreaProviderHttpGateway(String targetUri) {
        this.target = new RESTClient(targetUri)
    }

    Collection<SceneArea> findSceneAreasInAoi(String fusionTable, String keyColumn, String keyValue) {
        def response = target.get(path: 'sceneareas', query: [
                fusionTable: fusionTable,
                keyColumn  : keyColumn,
                keyValue   : keyValue])
        return response.data.collect {
            def polygon = it.polygon.size() == 1 ? it.polygon.first() : it.polygon
            new SceneArea(
                    id: it.sceneAreaId,
                    polygon: new Polygon(polygon.collect { new LatLng(it[0].toDouble(), it[1].toDouble()) }))
        }

    }
}