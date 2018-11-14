package org.openforis.sepal.component.processingrecipe.migration

class ClassificationMigrations extends AbstractMigrations {
    ClassificationMigrations() {
        super('CLASSIFICATION')
        addMigration(1, { r ->
            def result = [
                id: r.id,
                title: r.name?.trim(),
                placeholder: 'Migrated_Classification',
                type: 'CLASSIFICATION',
                model: [:]
            ]
            def source = [
                type: r.inputRecipe ? 'RECIPE_REF' : 'ASSET',
                id: r.inputRecipe ?: r.geeAssetId
            ]
            if (source.id)
                result.model.source = source
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