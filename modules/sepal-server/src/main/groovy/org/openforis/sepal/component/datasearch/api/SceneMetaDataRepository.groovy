package org.openforis.sepal.component.datasearch.api

interface SceneMetaDataRepository extends SceneMetaDataProvider {
    Map<String, Date> lastUpdateBySensor(String source)

    void updateAll(Collection<SceneMetaData> scenes)
}