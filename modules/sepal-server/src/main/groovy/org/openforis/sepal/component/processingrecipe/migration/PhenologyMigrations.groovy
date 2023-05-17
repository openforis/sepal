package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.migration.radarmosaic.SpeckleFilter

class PhenologyMigrations extends AbstractMigrations {
    PhenologyMigrations() {
        super('PHENOLOGY')
        addMigration(1, { Map r ->
            'SENTINEL_1' in r.model.sources.dataSets.keySet()
                ? SpeckleFilter.migrate(r)
                : r
        })
    }
}
