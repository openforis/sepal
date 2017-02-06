package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.component.datasearch.DataSet
import org.openforis.sepal.component.datasearch.SceneArea

interface GoogleEarthEngineGateway {
    Collection<SceneArea> findSceneAreasInAoi(DataSet dataSet, Aoi aoi)

    MapLayer preview(AutomaticSceneSelectingMapQuery query)

    MapLayer preview(PreselectedScenesMapQuery query)
}

