package org.openforis.sepal.component.datasearch.adapter

import groovy.json.JsonSlurper
import groovyx.net.http.RESTClient
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.datasearch.api.*
import org.openforis.sepal.component.processingrecipe.query.LoadRecipe
import org.openforis.sepal.user.User

import static groovy.json.JsonOutput.toJson
import static groovyx.net.http.ContentType.JSON
import static groovyx.net.http.ContentType.URLENC
import static java.util.Calendar.DAY_OF_YEAR
import static org.openforis.sepal.component.processingrecipe.api.Recipe.Type.CLASSIFICATION
import static org.openforis.sepal.component.processingrecipe.api.Recipe.Type.MOSAIC

class HttpGoogleEarthEngineGateway implements GoogleEarthEngineGateway {
    private final Component processingRecipeComponent
    private final String targetUri

    HttpGoogleEarthEngineGateway(Component processingRecipeComponent, String targetUri) {
        this.processingRecipeComponent = processingRecipeComponent
        this.targetUri = targetUri
    }

    Collection<SceneArea> findSceneAreasInAoi(DataSet dataSet, Aoi aoi, User user) {
        def response = endpoint.get(
                path: 'sceneareas',
                contentType: JSON,
                query: [dataSet: dataSet.name(), aoi: toJson(aoi.params)],
                headers: ['sepal-user': toJson(user)]
        )
        return response.data.collect {
            def polygon = it.polygon.size() == 1 ? it.polygon.first() : it.polygon
            new SceneArea(
                    id: it.sceneAreaId,
                    polygon: new Polygon(polygon.collect { new LatLng(it[0].toDouble(), it[1].toDouble()) }))
        }

    }

    MapLayer preview(AutomaticSceneSelectingMapQuery query, User user) {
        def image = [
                type                 : 'automatic',
                dataSet              : query.dataSet.name(),
                aoi                  : query.aoi.params,
                targetDayOfYear      : query.targetDayOfYear,
                targetDayOfYearWeight: query.targetDayOfYearWeight,
                shadowTolerance      : query.shadowTolerance,
                medianComposite      : query.medianComposite,
                brdfCorrect          : query.brdfCorrect,
                maskWater            : query.maskWater,
                maskSnow             : query.maskSnow,
                bands                : query.bands,
                sensors              : query.sensors,
                fromDate             : query.fromDate,
                toDate               : query.toDate,
        ]
        def response = endpoint.post(
                path: 'preview',
                requestContentType: URLENC,
                contentType: JSON,
                body: [image: toJson(image)],
                headers: ['sepal-user': toJson(user)]
        )
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }

    MapLayer preview(PreselectedScenesMapQuery query, User user) {
        def image = [
                type                 : 'manual',
                dataSet              : query.dataSet.name(),
                aoi                  : query.aoi.params,
                targetDayOfYear      : query.targetDayOfYear,
                targetDayOfYearWeight: query.targetDayOfYearWeight,
                shadowTolerance      : query.shadowTolerance,
                hazeTolerance        : query.hazeTolerance,
                greennessWeight      : query.greennessWeight,
                medianComposite      : query.medianComposite,
                brdfCorrect          : query.brdfCorrect,
                maskClouds           : query.maskClouds,
                maskSnow             : query.maskSnow,
                bands                : query.bands,
                sceneIds             : query.sceneIds
        ]
        def response = endpoint.post(
                path: 'preview',
                requestContentType: URLENC,
                contentType: JSON,
                body: [image: toJson(image)],
                headers: ['sepal-user': toJson(user)]
        )
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }

    MapLayer preview(ClassificationQuery query, User user) {
        def image = [
                imageType      : CLASSIFICATION.name(),
                imageToClassify: toImageMap(query.imageRecipeId),
                tableName      : query.tableName,
                classProperty  : query.classProperty,
                algorithm      : query.algorithm
        ]

        def response = endpoint.post(
                path: 'preview',
                requestContentType: URLENC,
                contentType: JSON,
                body: [image: toJson(image)],
                headers: ['sepal-user': toJson(user)]
        )
        return new MapLayer(
                id: response.data.mapId,
                token: response.data.token
        )
    }

    private Map toImageMap(String recipeId) {
        def recipe = processingRecipeComponent.submit(new LoadRecipe(recipeId))
        def contents = new JsonSlurper().parseText(recipe.contents)
        def imageType = recipe.type
        switch (imageType) {
            case MOSAIC:
                def aoi = contents.polygon ?
                        [type: 'polygon', path: new JsonSlurper().parseText(contents.polygon) as List] :
                        [type: 'fusionTable', tableName: FUSION_TABLE, keyColumn: KEY_COLUMN, keyValue: contents.aoiCode]
                def dayOfYear = Date.parse('yyyy-MM-dd', contents.targetDate)[DAY_OF_YEAR]
                def sceneIds = contents.sceneAreas.values().collect { it.selection }.flatten()
                return [
                        imageType            : MOSAIC.name(),
                        type                 : 'manual',
                        dataSet              : contents.sensorGroup,
                        aoi                  : aoi,
                        targetDayOfYear      : dayOfYear,
                        targetDayOfYearWeight: contents.mosaicTargetDayWeight,
                        shadowTolerance      : contents.mosaicShadowTolerance,
                        hazeTolerance        : contents.mosaicHazeTolerance,
                        greennessWeight      : contents.mosaicGreennessWeight,
                        medianComposite      : contents.median,
                        brdfCorrect          : contents.brdfCorrect,
                        maskClouds           : contents.maskClouds,
                        maskSnow             : contents.maskSnow,
                        bands                : contents.bands,
                        sceneIds             : sceneIds
                ]
            case CLASSIFICATION:
                return [
                        imageType      : CLASSIFICATION.name(),
                        imageToClassify: toImageMap(contents.imageToClassify),
                        tableName      : contents.tableName,
                        classProperty  : contents.classProperty,
                        algorithm      : contents.algorithm
                ]
            default:
                throw new IllegalStateException("Unsupported imageType: $imageType")
        }

    }

    RESTClient getEndpoint() {
        new RESTClient(targetUri)
    }
}
