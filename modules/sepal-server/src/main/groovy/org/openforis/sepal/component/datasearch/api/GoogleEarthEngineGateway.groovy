package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.user.User

interface GoogleEarthEngineGateway {
    Collection<SceneArea> findSceneAreasInAoi(DataSet dataSet, Aoi aoi, User user)

    MapLayer preview(AutomaticSceneSelectingMapQuery query, User user)

    MapLayer preview(PreselectedScenesMapQuery query, User user)
}

