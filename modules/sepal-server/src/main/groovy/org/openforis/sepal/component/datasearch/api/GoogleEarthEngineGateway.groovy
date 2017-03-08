package org.openforis.sepal.component.datasearch.api

interface GoogleEarthEngineGateway {
    Collection<SceneArea> findSceneAreasInAoi(DataSet dataSet, Aoi aoi)

    MapLayer preview(AutomaticSceneSelectingMapQuery query)

    MapLayer preview(PreselectedScenesMapQuery query)
}

