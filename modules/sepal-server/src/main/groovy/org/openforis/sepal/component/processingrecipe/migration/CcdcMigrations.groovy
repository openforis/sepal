package org.openforis.sepal.component.processingrecipe.migration

class CcdcMigrations extends AbstractMigrations {
    CcdcMigrations() {
        super('CCDC')
        addMigration(5, { Map r ->
            r.model.options.cloudDetection = r.model.options.cloudMasking == 'AGGRESSIVE'
                    ? ['QA', 'CLOUD_MASK']
                    : ['QA']
            return r
        })
    }
}
