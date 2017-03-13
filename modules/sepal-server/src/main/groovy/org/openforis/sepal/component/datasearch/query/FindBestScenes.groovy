package org.openforis.sepal.component.datasearch.query

import org.openforis.sepal.component.datasearch.api.DataSet
import org.openforis.sepal.component.datasearch.api.SceneMetaData
import org.openforis.sepal.component.datasearch.api.SceneMetaDataProvider
import org.openforis.sepal.component.datasearch.api.SceneQuery
import org.openforis.sepal.component.datasearch.internal.Scenes
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

import static org.openforis.sepal.component.datasearch.api.DataSet.LANDSAT

@Data
class FindBestScenes implements Query<Map<String, List<SceneMetaData>>> {
    DataSet dataSet
    Collection<String> sceneAreaIds
    Collection<String> sensorIds
    Date fromDate
    Date toDate
    int targetDayOfYear
    double targetDayOfYearWeight
    double cloudCoverTarget
    int minScenes = 1
    int maxScenes = Integer.MAX_VALUE
}

class FindBestScenesHandler implements QueryHandler<Map<String, List<SceneMetaData>>, FindBestScenes> {
    private final SceneMetaDataProvider sceneMetaDataProvider

    FindBestScenesHandler(SceneMetaDataProvider sceneMetaDataProvider) {
        this.sceneMetaDataProvider = sceneMetaDataProvider
    }

    Map<String, List<SceneMetaData>> execute(FindBestScenes query) {
        if (query.dataSet == LANDSAT)
            landsat(query)
        else
            sentinel2(query)
    }

    private Map<String, List<SceneMetaData>> sentinel2(FindBestScenes query) {
        def allScenes = [] as List<SceneMetaData>
        query.sceneAreaIds.each { sceneAreaId ->
            sceneMetaDataProvider.eachScene(
                    new SceneQuery(
                            dataSet: query.dataSet,
                            sceneAreaId: sceneAreaId,
                            sensorIds: query.sensorIds,
                            fromDate: query.fromDate,
                            toDate: query.toDate,
                            targetDayOfYear: query.targetDayOfYear),
                    query.targetDayOfYearWeight) {
                allScenes << it
                return true
            }
        }


        def selectedScenes = new Scenes(allScenes).selectScenes(
                1 - query.cloudCoverTarget,
                query.minScenes,
                query.maxScenes,
                new Scenes.ScoringAlgorithm() {
                    double score(SceneMetaData scene, double improvement) {
                        return improvement
                    }
                }
        )
        def scenesBySceneAreaId = selectedScenes.groupBy {
            it.sceneAreaId
        }
        return scenesBySceneAreaId
    }

    private Map<String, List<SceneMetaData>> landsat(FindBestScenes query) {
        query.sceneAreaIds.collectEntries { sceneAreaId ->
            def scenes = []
            def cloudCover = 1
            sceneMetaDataProvider.eachScene(
                    new SceneQuery(
                            dataSet: query.dataSet,
                            sceneAreaId: sceneAreaId,
                            sensorIds: query.sensorIds,
                            fromDate: query.fromDate,
                            toDate: query.toDate,
                            targetDayOfYear: query.targetDayOfYear),
                    query.targetDayOfYearWeight) { SceneMetaData scene ->
                scenes << scene
                cloudCover *= scene.cloudCover / 100
                if (query.maxScenes <= scenes.size())
                    return false
                return (cloudCover > query.cloudCoverTarget || scenes.size() < query.minScenes)
            }
            return [(sceneAreaId): scenes]
        }
    }
}
