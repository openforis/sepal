package org.openforis.sepal.component.processingrecipe.migration


import org.openforis.sepal.component.processingrecipe.migration.v3.V3Migration
import org.openforis.sepal.component.processingrecipe.migration.radarmosaic.SpeckleFilter

class RadarMosaicMigrations extends AbstractMigrations {
    RadarMosaicMigrations() {
        super('RADAR_MOSAIC')
        addMigration(3, { return V3Migration.migrate(it) })
        addMigration(4, { return SpeckleFilter.migrate(it) })
    }
}
