package org.openforis.sepal.component.datasearch.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import groovymvc.Params
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.component.datasearch.query.FindBestScenes
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.util.DateTime

import static groovy.json.JsonOutput.toJson

class DataSearchEndpoint {
    private static final FUSION_TABLE = '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F'
    private static final KEY_COLUMN = 'ISO'
    private final Component component
    private final GoogleEarthEngineGateway geeGateway
    private final String googleMapsApiKey

    DataSearchEndpoint(Component component,
                       GoogleEarthEngineGateway geeGateway,
                       String googleMapsApiKey) {
        this.component = component
        this.googleMapsApiKey = googleMapsApiKey
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
                def dataSet = params['dataSet'] as DataSet ?: DataSet.LANDSAT
                def sceneAreas = component.submit(new FindSceneAreasForAoi(
                        sepalUser,
                        dataSet,
                        toAoi(params)))
                def data = sceneAreas.collect { [sceneAreaId: it.id, polygon: polygonData(it)] }
                send(toJson(data))
            }

            post('/data/mosaic/preview') {
                response.contentType = "application/json"
                def dataSet = params['dataSet'] as DataSet ?: DataSet.LANDSAT
                def sceneIds = params.required('sceneIds', String).split(',')*.trim()
                def bands = params.required('bands', String).split(',')*.trim()
                def targetDayOfYear = params.required('targetDayOfYear', int)
                def targetDayOfYearWeight = params.required('targetDayOfYearWeight', double)
                def shadowTolerance = params.optional('shadowTolerance', Double) ?: 0.5
                def medianComposite = params.optional('medianComposit', Boolean) ?: false
                def brdfCorrect = params.optional('brdfCorrect', Boolean) ?: false
                def maskWater = params.optional('maskWater', Boolean) ?: false
                def maskSnow = params.optional('maskSnow', Boolean) ?: false

                def mapLayer = geeGateway.preview(new PreselectedScenesMapQuery(
                        dataSet: dataSet,
                        sceneIds: sceneIds,
                        aoi: toAoi(params),
                        targetDayOfYear: targetDayOfYear,
                        targetDayOfYearWeight: targetDayOfYearWeight,
                        shadowTolerance: shadowTolerance,
                        medianComposite: medianComposite,
                        brdfCorrect: brdfCorrect,
                        maskWater: maskWater,
                        maskSnow: maskSnow,
                        bands: bands
                ), sepalUser)

                send(toJson(
                        mapId: mapLayer.id,
                        token: mapLayer.token
                ))
            }

            post('/data/best-scenes') {
                response.contentType = "application/json"
                def dataSet = params['dataSet'] as DataSet ?: DataSet.LANDSAT
                def query = new FindBestScenes(
                        dataSet: dataSet,
                        sceneAreaIds: params.required('sceneAreaIds', String).split(',')*.trim(),
                        sensorIds: params.required('sensorIds', String).split(',')*.trim(),
                        fromDate: DateTime.parseDateString(params.required('fromDate', String)),
                        toDate: DateTime.parseDateString(params.required('toDate', String)),
                        targetDayOfYear: params.required('targetDayOfYear', int),
                        targetDayOfYearWeight: params.required('targetDayOfYearWeight', double),
                        cloudCoverTarget: params.required('cloudCoverTarget', double),
                        minScenes: toInt(params.minScenes as String, 1),
                        maxScenes: toInt(params.maxScenes as String, Integer.MAX_VALUE))
                def scenesByArea = component.submit(query)
                def data = scenesByArea.collectEntries { sceneAreaId, scenes ->
                    [(sceneAreaId): scenes.collect { sceneData(it, query.targetDayOfYear) }]
                }
                send(toJson(data))
            }

            get('/data/sceneareas/{sceneAreaId}') {
                response.contentType = "application/json"
                def dataSet = params['dataSet'] as DataSet ?: DataSet.LANDSAT
                def query = new SceneQuery(
                        dataSet: dataSet,
                        sceneAreaId: params.sceneAreaId,
                        fromDate: DateTime.parseDateString(params.required('fromDate', String)),
                        toDate: DateTime.parseDateString(params.required('toDate', String)),
                        targetDayOfYear: params.required('targetDayOfYear', int)
                )
                def scenes = component.submit(new FindScenesForSceneArea(query))
                def data = scenes.collect { sceneData(it, query.targetDayOfYear) }
                send(toJson(data))
            }
        }
    }

    private Aoi toAoi(Params params) {
        def polygon = params.polygon as String
        def aoi = polygon ?
                new AoiPolygon(new JsonSlurper().parseText(polygon) as List) :
                new FusionTableShape(
                        tableName: FUSION_TABLE,
                        keyColumn: KEY_COLUMN,
                        keyValue: params.required('countryIso', String))
        return aoi
    }

    Map sceneData(SceneMetaData scene, int targetDayOfYear) {
        [
                sceneId          : scene.id,
                dataSet          : scene.dataSet.name(),
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

    int toInt(String value, int defaultInt) {
        if (!value)
            return defaultInt
        try {
            return Integer.parseInt(value)
        } catch (Exception ignore) {
            return defaultInt
        }
    }
}
