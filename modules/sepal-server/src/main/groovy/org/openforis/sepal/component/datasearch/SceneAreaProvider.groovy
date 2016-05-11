package org.openforis.sepal.component.datasearch

interface SceneAreaProvider {
    Collection<SceneArea> findSceneAreasInAoi(String aoiId)

//    List<Map> findSceneAreasInPolygon()
}