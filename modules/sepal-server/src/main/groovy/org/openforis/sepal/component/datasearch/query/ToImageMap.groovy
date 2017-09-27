package org.openforis.sepal.component.datasearch.query

import groovy.json.JsonSlurper
import org.openforis.sepal.component.Component
import org.openforis.sepal.component.datasearch.api.AutomaticSceneSelectingMapQuery
import org.openforis.sepal.component.datasearch.api.ClassificationQuery
import org.openforis.sepal.component.datasearch.api.PreselectedScenesMapQuery
import org.openforis.sepal.component.processingrecipe.query.LoadRecipe
import org.openforis.sepal.query.Query
import org.openforis.sepal.query.QueryHandler
import org.openforis.sepal.util.annotation.Data

import static java.util.Calendar.DAY_OF_YEAR
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_CODE_FUSION_TABLE_COLUMN
import static org.openforis.sepal.component.datasearch.api.FusionTableShape.COUNTRY_FUSION_TABLE
import static org.openforis.sepal.component.processingrecipe.api.Recipe.Type.CLASSIFICATION
import static org.openforis.sepal.component.processingrecipe.api.Recipe.Type.MOSAIC

@Data
class ToImageMap implements Query<Map> {
    def query
}

class ToImageMapHandler implements QueryHandler<Map, ToImageMap> {
    private final Component processingRecipeComponent

    ToImageMapHandler(Component processingRecipeComponent) {
        this.processingRecipeComponent = processingRecipeComponent
    }

    Map execute(ToImageMap query) {
        return toImageMap(query.query)
    }

    private Map toImageMap(AutomaticSceneSelectingMapQuery query) {
        return [
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
    }

    private Map toImageMap(PreselectedScenesMapQuery query) {
        return [
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
    }

    private Map toImageMap(ClassificationQuery query) {
        return [
                imageType      : CLASSIFICATION.name(),
                imageToClassify: toImageMap(query.imageRecipeId),
                tableName      : query.tableName,
                classProperty  : query.classProperty,
                algorithm      : query.algorithm
        ]
    }

    private Map toImageMap(String recipeId) {
        def recipe = processingRecipeComponent.submit(new LoadRecipe(recipeId))
        def contents = new JsonSlurper().parseText(recipe.contents)
        def imageType = recipe.type
        switch (imageType) {
            case MOSAIC:
                def aoi = contents.polygon ?
                        [type: 'polygon', path: new JsonSlurper().parseText(contents.polygon) as List] :
                        [type     : 'fusionTable',
                         tableName: COUNTRY_FUSION_TABLE,
                         keyColumn: COUNTRY_CODE_FUSION_TABLE_COLUMN,
                         keyValue : contents.aoiCode]
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
}
