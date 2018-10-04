package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.api.Recipe

class ChangeDetectionMigrations extends AbstractMigrations {
    ChangeDetectionMigrations() {
        super('CHANGE_DETECTION')
        addMigration(1, { [:] })
    }
}