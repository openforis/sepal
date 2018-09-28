package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.api.Recipe

class ClassificationMigrations extends AbstractMigrations {
    ClassificationMigrations() {
        super(Recipe.Type.CLASSIFICATION)
        addMigration(1, { [:] })
    }
}