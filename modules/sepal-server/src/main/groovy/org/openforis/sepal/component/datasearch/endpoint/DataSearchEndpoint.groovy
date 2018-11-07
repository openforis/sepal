package org.openforis.sepal.component.datasearch.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import groovymvc.Params
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.component.datasearch.query.FindBestScenes
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.component.datasearch.query.ToImageMap
import org.openforis.sepal.component.task.command.SubmitTask

import static groovy.json.JsonOutput.toJson
import static java.time.temporal.ChronoUnit.YEARS
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_CODE_FUSION_TABLE_COLUMN
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_FUSION_TABLE
import static org.openforis.sepal.util.DateTime.*

class DataSearchEndpoint {
    private final Component component
    private final Component taskComponent
    private final GoogleEarthEngineGateway geeGateway
    private final String googleMapsApiKey

    DataSearchEndpoint(Component component,
                       Component taskComponent,
                       GoogleEarthEngineGateway geeGateway,
                       String googleMapsApiKey) {
        this.component = component
        this.taskComponent = taskComponent
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
                def source = params.required('source', String)
                def sceneAreas = component.submit(new FindSceneAreasForAoi(
                    sepalUser,
                    source,
                    toAoi(params)))
                def data = sceneAreas.collect { [sceneAreaId: it.id, polygon: polygonData(it)] }
                send(toJson(data))
            }

            post('/data/mosaic/preview') {
                response.contentType = "application/json"
                def mapLayer = geeGateway.preview(toPreselectedScenesImageMap(params), sepalUser)

                send(toJson(
                    mapId: mapLayer.id,
                    token: mapLayer.token
                ))
            }

            post('/data/classification/preview') {
                def mapLayer = geeGateway.preview(toClassificationMap(params), sepalUser)

                send(toJson(
                    mapId: mapLayer.id,
                    token: mapLayer.token
                ))
            }

            post('/data/classification/retrieve') {
                def name = params.required('name')
                taskComponent.submit(new SubmitTask(
                    operation: params.destination == 'gee' ? 'sepal.image.asset_export' : 'sepal.image.sepal_export',
                    params: [
                        title: params.destination == 'gee'
                            ? "Export classification '$name' to Earth Engine"
                            : "Retrieve classification '$name' to Sepal",
                        description: name,
                        image: toClassificationMap(params)
                    ],
                    username: currentUser.username
                ))
                send toJson([status: 'OK'])
            }

            post('/data/change-detection/preview') {
                def mapLayer = geeGateway.preview(toChangeDetectionMap(params), sepalUser)

                send(toJson(
                    mapId: mapLayer.id,
                    token: mapLayer.token
                ))
            }

            post('/data/change-detection/retrieve') {
                def name = params.required('name')
                taskComponent.submit(new SubmitTask(
                    operation: params.destination == 'gee' ? 'sepal.image.asset_export' : 'sepal.image.sepal_export',
                    params: [
                        title: params.destination == 'gee'
                            ? "Export change-detection '$name' to Earth Engine"
                            : "Retrieve change-detection '$name' to Sepal",
                        description: name,
                        image: toChangeDetectionMap(params)
                    ],
                    username: currentUser.username
                ))
                send toJson([status: 'OK'])
            }

            post('/data/best-scenes') {
                response.contentType = "application/json"
                def clientQuery = new JsonSlurper().parseText(params.required('query', String))
                def query = new FindBestScenes(
                    sceneAreaIds: clientQuery.sceneAreaIds,
                    source: clientQuery.sources.keySet().first(),
                    dataSets: clientQuery.sources.values().flatten(),
                    fromDate: subtractFromDate(clientQuery.dates.seasonStart, clientQuery.dates.yearsBefore as int, YEARS),
                    toDate: addToDate(clientQuery.dates.seasonEnd, clientQuery.dates.yearsAfter as int, YEARS),
                    targetDayOfYear: dayOfYearIgnoringLeapDay(clientQuery.dates.targetDate),
                    targetDayOfYearWeight: clientQuery.sceneSelectionOptions.targetDateWeight,
                    cloudCoverTarget: clientQuery.cloudCoverTarget,
                    minScenes: clientQuery.sceneCount.min as int,
                    maxScenes: clientQuery.sceneCount.max as int
                )
                def scenesByArea = component.submit(query)
                def data = scenesByArea.collectEntries { sceneAreaId, scenes ->
                    [(sceneAreaId): scenes.collect { sceneData(it, query.targetDayOfYear) }]
                }
                send(toJson(data))
            }

            get('/data/sceneareas/{sceneAreaId}') {
                response.contentType = "application/json"
                def clientQuery = new JsonSlurper().parseText(params.required('query', String))
                def query = new SceneQuery(
                    sceneAreaId: params.required('sceneAreaId'),
                    source: clientQuery.sources.keySet().first(),
                    dataSets: clientQuery.sources.values().flatten(),
                    fromDate: subtractFromDate(clientQuery.dates.seasonStart, clientQuery.dates.yearsBefore as int, YEARS),
                    toDate: addToDate(clientQuery.dates.seasonEnd, clientQuery.dates.yearsAfter as int, YEARS),
                    targetDayOfYear: dayOfYearIgnoringLeapDay(clientQuery.dates.targetDate),
                    targetDayOfYearWeight: clientQuery.sceneSelectionOptions.targetDateWeight as double
                )
                def scenes = component.submit(new FindScenesForSceneArea(query))
                def data = scenes.collect { sceneData(it, query.targetDayOfYear) }
                send(toJson(data))
            }

            post('/data/scenes/retrieve') {
                response.contentType = "application/json"
                def sceneIds = fromJson(params.required('sceneIds', String)) as List<String>
                taskComponent.submit(new SubmitTask(
                    operation: 'landsat-scene-download',
                    params: [
                        source: params.required('source', String),
                        sceneIds: sceneIds
                    ],
                    username: currentUser.username
                ))
                send toJson([status: 'OK'])
            }

        }
    }

    private Map toClassificationMap(params) {
        component.submit(new ToImageMap(
            new ClassificationQuery(
                imageRecipeId: params.imageRecipeId,
                assetId: params.assetId,
                tableName: params.required('tableName', String),
                classProperty: params.required('classProperty', String),
                algorithm: params.required('algorithm', String)
            )))
    }

    private Map toChangeDetectionMap(params) {
        component.submit(new ToImageMap(
            new ChangeDetectionQuery(
                fromImageRecipeId: params.fromImageRecipeId,
                toImageRecipeId: params.toImageRecipeId,
                fromAssetId: params.fromAssetId,
                toAssetId: params.toAssetId,
                tableName: params.required('tableName', String),
                classProperty: params.required('classProperty', String),
                algorithm: params.required('algorithm', String)
            )))
    }

    private Map toPreselectedScenesImageMap(params) {
        component.submit(new ToImageMap(
            new PreselectedScenesMapQuery([
                source: params.required('source', String),
                sceneIds: params.required('sceneIds', String).split(',')*.trim(),
                aoi: toAoi(params),
                targetDayOfYear: (params.targetDayOfYear ?: 1) as int,
                targetDayOfYearWeight: (params.targetDayOfYearWeight ?: 0) as double,
                shadowTolerance: (params.shadowTolerance ?: 0) as double,
                hazeTolerance: (params.hazeTolerance ?: 0.05) as double,
                greennessWeight: (params.greennessWeight ?: 0) as double,
                medianComposite: params.medianComposite == 'true',
                brdfCorrect: params.brdfCorrect == 'true',
                maskClouds: params.maskClouds == 'true',
                maskSnow: params.maskSnow == 'true',
                bands: params.required('bands', String).split(',')*.trim(),
                panSharpening: params.panSharpening == 'true'
            ])))
    }


    private Aoi toAoi(Params params) {
        def polygon = params.polygon as String
        def aoi = polygon ?
            new AoiPolygon(new JsonSlurper().parseText(polygon) as List) :
            new FusionTableShape(
                tableName: params.aoiFusionTable ?: COUNTRY_FUSION_TABLE,
                keyColumn: params.aoiFusionTableKeyColumn ?: COUNTRY_CODE_FUSION_TABLE_COLUMN,
                keyValue: params.aoiFusionTableKey ?: params.required('countryIso', String))
        return aoi
    }

    Map sceneData(SceneMetaData scene, int targetDayOfYear) {
        [
            id: scene.id,
            dataSet: scene.dataSet,
            browseUrl: scene.browseUrl as String,
            date: toDateString(scene.acquisitionDate),
            cloudCover: scene.cloudCover,
            daysFromTarget: daysFromDayOfYear(scene.acquisitionDate, targetDayOfYear)
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
