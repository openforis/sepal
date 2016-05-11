package org.openforis.sepal.component.datasearch

interface SceneMetaDataProvider {
    List<SceneMetaData> findScenesInSceneArea(SceneQuery sceneQuery)
}