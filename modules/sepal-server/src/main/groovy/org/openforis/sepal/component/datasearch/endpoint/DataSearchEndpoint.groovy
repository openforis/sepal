package org.openforis.sepal.component.datasearch.endpoint

import groovy.json.JsonSlurper
import groovymvc.Controller
import groovymvc.Params
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.component.datasearch.query.FindBestScenes
import org.openforis.sepal.component.datasearch.query.FindSceneAreasForAoi
import org.openforis.sepal.component.datasearch.query.FindScenesForSceneArea
import org.openforis.sepal.component.task.command.SubmitTask

import static groovy.json.JsonOutput.toJson
import static java.time.temporal.ChronoUnit.YEARS
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_CODE_FUSION_TABLE_COLUMN
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_FUSION_TABLE
import static org.openforis.sepal.util.DateTime.*

class DataSearchEndpoint {
    private final Component component
    private final GoogleEarthEngineGateway geeGateway
    private final String googleMapsApiKey
    private final String nicfiPlanetApiKey

    DataSearchEndpoint(Component component,
                       GoogleEarthEngineGateway geeGateway,
                       String googleMapsApiKey,
                       String nicfiPlanetApiKey) {
        this.component = component
        this.googleMapsApiKey = googleMapsApiKey
        this.nicfiPlanetApiKey = nicfiPlanetApiKey
        this.geeGateway = geeGateway
    }

    void registerWith(Controller controller) {
        controller.with {
            get('/data/map-api-keys') {
                response.contentType = "application/json"
                send toJson(google: googleMapsApiKey, nicfiPlanet: nicfiPlanetApiKey)
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

            post('/data/best-scenes') {
                response.contentType = "application/json"
                def clientQuery = new JsonSlurper().parseText(params.required('query', String))
                def query = new FindBestScenes(
                    sceneAreaIds: clientQuery.sceneAreaIds,
                    source: clientQuery.sources.dataSets.keySet().first(),
                    dataSets: clientQuery.sources.dataSets.values().flatten(),
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
                    source: clientQuery.sources.dataSets.keySet().first(),
                    dataSets: clientQuery.sources.dataSets.values().flatten(),
                    fromDate: subtractFromDate(clientQuery.dates.seasonStart, clientQuery.dates.yearsBefore as int, YEARS),
                    toDate: addToDate(clientQuery.dates.seasonEnd, clientQuery.dates.yearsAfter as int, YEARS),
                    targetDayOfYear: dayOfYearIgnoringLeapDay(clientQuery.dates.targetDate),
                    targetDayOfYearWeight: clientQuery.sceneSelectionOptions.targetDateWeight as double
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
                tableName: params.aoiFusionTable ?: COUNTRY_FUSION_TABLE,
                keyColumn: params.aoiFusionTableKeyColumn ?: COUNTRY_CODE_FUSION_TABLE_COLUMN,
                keyValue: params.aoiFusionTableKey ?: params.required('countryIso', String))
        return aoi
    }

    Map sceneData(SceneMetaData scene, int targetDayOfYear) {
        [
            id: scene.id,
            dataSet: scene.dataSet,
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
