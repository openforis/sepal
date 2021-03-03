package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.migration.v3.V3Migration

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
        addMigration(3, { return V3Migration.migrate(it) })
        addMigration(4, { r ->
            r.model.legend = [entries: []]
            if (r.model.trainingData) {
                def table = r.model.trainingData.eeTable
                def column = r.model.trainingData.eeTableColumn
                r.model.trainingData = [
                        "dataSets": [
                                [
                                        "dataSetId": UUID.randomUUID().toString(),
                                        "name": "Collected reference data",
                                        "type": "COLLECTED",
                                        "referenceData": []
                                ],
                                [
                                        "dataSetId": UUID.randomUUID().toString(),
                                        "name": "EE Table",
                                        "type": "EE_TABLE",
                                        "eeTable": "${table}",
                                        "locationType": "GEO_JSON",
                                        "geoJsonColumn": ".geo",
                                        "classColumnFormat": "SINGLE_COLUMN",
                                        "valueColumn": "${column}",
                                        "referenceData": []
                                ]
                        ]
                ]
            }
            r.model.classifier = [
                    "type": "RANDOM_FOREST",
                    "numberOfTrees": 25,
                    "variablesPerSplit": null,
                    "minLeafPopulation": 1,
                    "bagFraction": 0.5,
                    "maxNodes": null,
                    "seed": 1,
                    "lambda": 0.000001,
                    "decisionProcedure": "Voting",
                    "svmType": "C_SVC",
                    "kernelType": "LINEAR",
                    "shrinking": true,
                    "degree": 3,
                    "gamma": null,
                    "coef0": 0,
                    "cost": 1,
                    "nu": 0.5,
                    "oneClass": null,
                    "metric": "euclidean",
                    "decisionTree": ""
            ]
            return r
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
