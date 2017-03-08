package org.openforis.sepal.component.datasearch.api

interface SceneMetaDataRepository extends SceneMetaDataProvider {
    Map<String, Date> lastUpdateBySensor(DataSet source)

    void updateAll(Collection<SceneMetaData> scenes)
}