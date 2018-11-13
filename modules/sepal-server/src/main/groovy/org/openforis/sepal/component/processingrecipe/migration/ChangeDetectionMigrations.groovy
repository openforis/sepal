package org.openforis.sepal.component.processingrecipe.migration

class ChangeDetectionMigrations extends AbstractMigrations {
    ChangeDetectionMigrations() {
        super('CHANGE_DETECTION')
        addMigration(1, { r ->
            def result = [
                id: r.id,
                title: r.name?.trim(),
                placeholder: 'Migrated_Change_detection',
                type: 'CHANGE_DETECTION',
                model: [:]
            ]
            def source1 = [
                type: r.inputRecipe1 ? 'RECIPE_REF' : 'ASSET',
                id: r.inputRecipe1 ?: r.geeAssetId1
            ]
            if (source1.id)
                result.model.source1 = source1
            def source2 = [
                type: r.inputRecipe2 ? 'RECIPE_REF' : 'ASSET',
                id: r.inputRecipe2 ?: r.geeAssetId2
            ]
            if (source2.id)
                result.model.source2 = source2
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