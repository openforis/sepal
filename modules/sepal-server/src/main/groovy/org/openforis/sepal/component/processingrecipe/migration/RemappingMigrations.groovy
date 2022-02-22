package org.openforis.sepal.component.processingrecipe.migration

class RemappingMigrations extends AbstractMigrations {
    RemappingMigrations() {
        super('REMAPPING')
        // Link constraints to imagery using imageId (the guid) instead of id (recipeId or assetId)
        addMigration(1, { Map r ->
            def images = r.model.inputImagery.images
            r.model.legend.entries.forEach { entry ->
                entry.constraints.forEach { constraint ->
                    def prevImage = constraint.image
                    def image = images.find {
                        it.id == prevImage
                    }
                    if (image) {
                        constraint.image = image.imageId
                    }
                }
            }
            return r
        })
    }
}
