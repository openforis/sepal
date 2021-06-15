package org.openforis.sepal.component.processingrecipe.migration.v5

class V5Migration {
    static Map migrate(Map r) {
        if (r.model.compositeOptions)
            updateCompositeOptions(r.model.compositeOptions)
        return r
    }

    static void updateCompositeOptions(compositeOptions) {
        compositeOptions.cloudDetection = compositeOptions.cloudMasking == 'AGGRESSIVE'
            ? ['QA', 'CLOUD_SCORE']
            : ['QA']
    }
}
