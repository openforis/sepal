package org.openforis.sepal.component.processingrecipe.migration

import org.openforis.sepal.component.processingrecipe.migration.radarmosaic.SpeckleFilter
import org.openforis.sepal.component.processingrecipe.migration.v7.V7Migration

class CcdcMigrations extends AbstractMigrations {
    CcdcMigrations() {
        super('CCDC')
        addMigration(5, { Map r ->
            r.model.options.cloudDetection = r.model.options.cloudMasking == 'AGGRESSIVE'
                    ? ['QA', 'CLOUD_MASK']
                    : ['QA']
            return r
        })
        addMigration(6, { Map r ->
            'SENTINEL_1' in r.model.sources.dataSets.keySet()
                ? SpeckleFilter.migrate(r)
                : r
        })
        addMigration(7, { return V7Migration.migrate(it) })
    }
}
