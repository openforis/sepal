package org.openforis.sepal.component.datasearch

import groovyx.net.http.RESTClient

interface SceneAreaProvider {
    Collection<SceneArea> findSceneAreasInAoi(String aoiId)

//    List<Map> findSceneAreasInPolygon()
}

class SceneAreaProviderHttpGateway implements SceneAreaProvider {
    private final RESTClient target

    SceneAreaProviderHttpGateway(String targetUri) {
        this.target = new RESTClient(targetUri)
    }

    Collection<SceneArea> findSceneAreasInAoi(String aoiId) {
        def response = target.get(path: 'sceneareas', query: [aoiId: aoiId])
        return response.data.collect {
            // TODO: Investigate strange results, where polygon sometimes only contains a single entry with list of points
            def polygon = it.polygon.size() == 1 ? it.polygon.first() : it.polygon
            new SceneArea(
                    id: it.sceneAreaId,
                    polygon: new Polygon(polygon.collect { new LatLng(it[0].toDouble(), it[1].toDouble()) }))
        }

    }
}