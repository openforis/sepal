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
import org.openforis.sepal.util.DateTime

import static groovy.json.JsonOutput.toJson
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_CODE_FUSION_TABLE_COLUMN
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_FUSION_TABLE

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
                def mapLayer = geeGateway.preview(toPreselectedScenesImageMap(params), sepalUser)

                send(toJson(
                        mapId: mapLayer.id,
                        token: mapLayer.token
                ))
            }
//
//            post('/data/mosaic/retrieve') {
//                response.contentType = "application/json"
//                taskComponent.submit(new SubmitTask(
//                        operation: 'google-earth-engine-download',
//                        params: [
//                                name : params.required('name'),
//                                image: toPreselectedScenesImageMap(params),
//                                destination: params.destination ?: 'sepal'
//                        ],
//                        username: currentUser.username
//                ))
//                send toJson([status: 'OK'])
//            }

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
                                title      : params.destination == 'gee'
                                        ? "Export classification '$name' to Earth Engine"
                                        : "Retrieve classification '$name' to Sepal",
                                description: name,
                                image      : toClassificationMap(params)
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
                                title      : params.destination == 'gee'
                                        ? "Export change-detection '$name' to Earth Engine"
                                        : "Retrieve change-detection '$name' to Sepal",
                                description: name,
                                image      : toChangeDetectionMap(params)
                        ],
                        username: currentUser.username
                ))
                send toJson([status: 'OK'])
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

            post('/data/scenes/retrieve') {
                response.contentType = "application/json"
                def sceneIds = fromJson(params.required('sceneIds', String)) as List<String>
                taskComponent.submit(new SubmitTask(
                        operation: 'landsat-scene-download',
                        params: [
                                dataSet : params.required('dataSet'),
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
                        dataSet              : params['dataSet'] as DataSet ?: DataSet.LANDSAT,
                        sceneIds             : params.required('sceneIds', String).split(',')*.trim(),
                        aoi                  : toAoi(params),
                        targetDayOfYear      : (params.targetDayOfYear ?: 1) as int,
                        targetDayOfYearWeight: (params.targetDayOfYearWeight ?: 0) as double,
                        shadowTolerance      : (params.shadowTolerance ?: 0) as double,
                        hazeTolerance        : (params.hazeTolerance ?: 0.05) as double,
                        greennessWeight      : (params.greennessWeight ?: 0) as double,
                        medianComposite      : params.medianComposite == 'true',
                        brdfCorrect          : params.brdfCorrect == 'true',
                        maskClouds           : params.maskClouds == 'true',
                        maskSnow             : params.maskSnow == 'true',
                        bands                : params.required('bands', String).split(',')*.trim(),
                        panSharpening        : params.panSharpening == 'true'
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
