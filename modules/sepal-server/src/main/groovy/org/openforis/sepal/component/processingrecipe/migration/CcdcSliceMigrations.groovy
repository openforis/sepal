package org.openforis.sepal.component.processingrecipe.migration

class CcdcSliceMigrations extends AbstractMigrations {
    CcdcSliceMigrations() {
        super('CCDC_SLICE')
        addMigration(1) {Map r ->
            def source = r.model.source
            source.type = 'ASSET'
            source.dateFormat = 0
            source.id = source.asset
            source.remove('asset')
            return r
        }
    }
}
