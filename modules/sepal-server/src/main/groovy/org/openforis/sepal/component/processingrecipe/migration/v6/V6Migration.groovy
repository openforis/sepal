package org.openforis.sepal.component.processingrecipe.migration.v6

class V6Migration {
    static Map migrate(Map r) {
        if (r.model.sources)
            r.model.sources = [
                dataSets: r.model.sources, 
                cloudPercentageThreshold: 100
            ]
        return r
    }
}
