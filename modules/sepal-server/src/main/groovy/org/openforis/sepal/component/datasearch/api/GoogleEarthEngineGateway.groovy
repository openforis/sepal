package org.openforis.sepal.component.datasearch.api

import org.openforis.sepal.user.User

interface GoogleEarthEngineGateway {
    static final FUSION_TABLE = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
    static final KEY_COLUMN = 'ISO'

    Collection<SceneArea> findSceneAreasInAoi(DataSet dataSet, Aoi aoi, User user)

    MapLayer preview(AutomaticSceneSelectingMapQuery query, User user)

    MapLayer preview(PreselectedScenesMapQuery query, User user)

    MapLayer preview(ClassificationQuery query, User user)
}

