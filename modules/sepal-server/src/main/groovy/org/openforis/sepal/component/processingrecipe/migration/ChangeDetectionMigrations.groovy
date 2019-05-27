package org.openforis.sepal.component.processingrecipe.migration

class ChangeDetectionMigrations extends AbstractMigrations {
    ChangeDetectionMigrations() {
        super('CHANGE_DETECTION')
        addMigration(1, { r ->
            def result = [
                id: r.id,
                title: r.name?.trim(),
                placeholder: 'Migrated_Change_detection',
                type: 'CLASSIFICATION',
                model: [inputImagery: [images: []]]
            ]
            ClassificationMigrations.addImage(
                r.inputRecipe1 ? 'RECIPE_REF' : 'ASSET',
                r.inputRecipe1 ?: r.geeAssetId1,
                result
            )
            ClassificationMigrations.addImage(
                r.inputRecipe2 ? 'RECIPE_REF' : 'ASSET',
                r.inputRecipe2 ?: r.geeAssetId2,
                result
            )
            def trainingData = [
                fusionTable: r.fusionTableId,
                fusionTableColumn: r.fusionTableClassColumn
            ]
            if (trainingData.fusionTable)
                result.model.trainingData = trainingData
            return result
        })
    }
}
