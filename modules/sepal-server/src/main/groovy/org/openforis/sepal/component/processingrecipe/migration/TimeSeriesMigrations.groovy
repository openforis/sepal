package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.migration.v3.V3Migration

class TimeSeriesMigrations extends AbstractMigrations {
    TimeSeriesMigrations() {
        super('TIME_SERIES')
//        addMigration(3, { return V3Migration.migrate(it) })
    }
}
