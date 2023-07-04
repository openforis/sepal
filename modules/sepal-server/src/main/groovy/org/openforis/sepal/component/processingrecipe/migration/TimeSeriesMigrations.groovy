package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.migration.radarmosaic.SpeckleFilter

class TimeSeriesMigrations extends AbstractMigrations {
    TimeSeriesMigrations() {
        super('TIME_SERIES')
        addMigration(5, {Map r ->
            if (!r.model.options) {
                r.model.options = [:]
            }
            r.model.options.cloudDetection = (r.model.options && r.model.options.cloudMasking == 'AGGRESSIVE')
                    ? ['QA', 'CLOUD_MASK']
                    : ['QA']
            return r
        })
        addMigration(6, { Map r ->
            'SENTINEL_1' in r.model.sources.dataSets.keySet()
                ? SpeckleFilter.migrate(r)
                : r
        })
    }
}
