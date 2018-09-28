package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.api.Recipe

class ChangeDetectionMigrations extends AbstractMigrations {
    ChangeDetectionMigrations() {
        super(Recipe.Type.CLASSIFICATION)
        addMigration(1, { [:] })
    }
}