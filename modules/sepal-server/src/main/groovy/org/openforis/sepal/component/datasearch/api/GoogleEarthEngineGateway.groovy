package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.component.datasearch.SceneArea

interface GoogleEarthEngineGateway {
    Collection<SceneArea> findSceneAreasInAoi(FusionTableAoi aoi)

    MapLayer preview(AutomaticSceneSelectingMapQuery query)

    MapLayer preview(PreselectedScenesMapQuery query)
}

