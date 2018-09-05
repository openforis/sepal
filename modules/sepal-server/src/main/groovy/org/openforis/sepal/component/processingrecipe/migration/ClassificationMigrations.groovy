package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.api.Recipe

class ClassificationMigrations extends Migrations {
    ClassificationMigrations() {
        super(Recipe.Type.CLASSIFICATION)
        addMigration(1, { [:] })
    }
}