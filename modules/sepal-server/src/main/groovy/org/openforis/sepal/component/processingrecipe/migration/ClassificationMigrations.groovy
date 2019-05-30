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
                model: [inputImagery: [images: []]]
            ]
            ClassificationMigrations.addImage(
                r.inputRecipe ? 'RECIPE_REF' : 'ASSET',
                r.inputRecipe ?: r.geeAssetId,
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

    static void addImage(type, id, Map result) {
        def image = [
            type: type,
            id: id,
            imageId: UUID.randomUUID().toString(),
            bands: ['red', 'nir', 'swir1', 'swir2'],
            bandSetSpecs: [
                [
                    id: UUID.randomUUID().toString(),
                    type: 'IMAGE_BANDS',
                    included: ['red', 'nir', 'swir1', 'swir2']
                ],
                [
                    id: UUID.randomUUID().toString(),
                    type: 'PAIR_WISE_EXPRESSION',
                    operation: 'RATIO',
                    included: ['red', 'nir', 'swir1', 'swir2']
                ],
            ]
        ]
        if (image.id) {
            if (result.model.inputImagery.images)
                result.model.inputImagery.images << image
            else
                result.model.inputImagery.images = [image]
        }
    }
}
