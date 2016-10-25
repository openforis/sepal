package org.openforis.sepal.component.datasearch.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import groovymvc.Params
import org.openforis.sepal.command.CommandDispatcher
import org.openforis.sepal.component.datasearch.SceneArea
import org.openforis.sepal.component.datasearch.SceneMetaData
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.component.datasearch.query.FindBestScenes
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.query.QueryDispatcher
import org.openforis.sepal.util.DateTime

import static groovy.json.JsonOutput.toJson

class DataSearchEndpoint {
    private static final FUSION_TABLE = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
    private static final KEY_COLUMN = 'ISO'
    private final QueryDispatcher queryDispatcher
    private final CommandDispatcher commandDispatcher
    private final GoogleEarthEngineGateway geeGateway
    private final String googleMapsApiKey

    DataSearchEndpoint(QueryDispatcher queryDispatcher,
                       CommandDispatcher commandDispatcher,
                       GoogleEarthEngineGateway geeGateway,
                       String googleMapsApiKey) {
        this.googleMapsApiKey = googleMapsApiKey
        this.queryDispatcher = queryDispatcher
        this.commandDispatcher = commandDispatcher
        this.geeGateway = geeGateway
    }

    void registerWith(Controller controller) {
        controller.with {
            get('/data/google-maps-api-key') {
                response.contentType = "application/json"
                send toJson(apiKey: googleMapsApiKey)
            }
            post('/data/sceneareas') {
                response.contentType = "application/json"
                def sceneAreas = queryDispatcher.submit(new FindSceneAreasForAoi(
                        toAoi(params)))
                def data = sceneAreas.collect { [sceneAreaId: it.id, polygon: polygonData(it)] }
                send(toJson(data))
            }
            get('/data/sceneareas') { // TODO: Remove...
                response.contentType = "application/json"
                def sceneAreas = queryDispatcher.submit(new FindSceneAreasForAoi(
                        toAoi(params)))
                def data = sceneAreas.collect { [sceneAreaId: it.id, polygon: polygonData(it)] }
                send(toJson(data))
            }

            post('/data/mosaic/preview') {
                response.contentType = "application/json"
                def sceneIds = params.required('sceneIds', String).split(',')*.trim()
                def bands = params.required('bands', String).split(',')*.trim()
                def targetDayOfYear = params.required('targetDayOfYear', int)
                def targetDayOfYearWeight = params.required('targetDayOfYearWeight', double)

                def mapLayer = geeGateway.preview(new PreselectedScenesMapQuery(
                        sceneIds: sceneIds,
                        aoi: toAoi(params),
                        targetDayOfYear: targetDayOfYear,
                        targetDayOfYearWeight: targetDayOfYearWeight,
                        bands: bands
                ))

                send(toJson(
                        mapId: mapLayer.id,
                        token: mapLayer.token
                ))
            }

            post('/data/best-scenes') {
                response.contentType = "application/json"
                def query = new FindBestScenes(
                        sceneAreaIds: params.required('sceneAreaIds', String).split(',')*.trim(),
                        sensorIds: params.required('sensorIds', String).split(',')*.trim(),
                        fromDate: DateTime.parseDateString(params.required('fromDate', String)),
                        toDate: DateTime.parseDateString(params.required('toDate', String)),
                        targetDayOfYear: params.required('targetDayOfYear', int),
                        targetDayOfYearWeight: params.required('targetDayOfYearWeight', double),
                        cloudCoverTarget: params.required('cloudCoverTarget', double))
                def scenesByArea = queryDispatcher.submit(query)
                def data = scenesByArea.collectEntries { sceneAreaId, scenes ->
                    [(sceneAreaId): scenes.collect { sceneData(it, query.targetDayOfYear) }]
                }
                send(toJson(data))
            }

            get('/data/sceneareas/{sceneAreaId}') {
                response.contentType = "application/json"
                def query = new SceneQuery(
                        sceneAreaId: params.sceneAreaId,
                        fromDate: DateTime.parseDateString(params.required('fromDate', String)),
                        toDate: DateTime.parseDateString(params.required('toDate', String)),
                        targetDayOfYear: params.required('targetDayOfYear', int)
                )
                def scenes = queryDispatcher.submit(new FindScenesForSceneArea(query))
                def data = scenes.collect { sceneData(it, query.targetDayOfYear) }
                send(toJson(data))
            }
        }
    }

    private Aoi toAoi(Params params) {
        def polygon = params.polygon as String
        def aoi = polygon ?
                new Polygon(new JsonSlurper().parseText(polygon) as List) :
                new FusionTableShape(
                        tableName: FUSION_TABLE,
                        keyColumn: KEY_COLUMN,
                        keyValue: params.required('countryIso', String))
        return aoi
    }

    Map sceneData(SceneMetaData scene, int targetDayOfYear) {
        [
                sceneId          : scene.id,
                sensor           : scene.sensorId,
                browseUrl        : scene.browseUrl as String,
                acquisitionDate  : DateTime.toDateString(scene.acquisitionDate),
                cloudCover       : scene.cloudCover,
                sunAzimuth       : scene.sunAzimuth,
                sunElevation     : scene.sunElevation,
                daysFromTargetDay: DateTime.daysFromDayOfYear(scene.acquisitionDate, targetDayOfYear)
        ]
    }

    List polygonData(SceneArea sceneArea) {
        sceneArea.polygon.path.collect { [it.lat, it.lng] }
    }
}
