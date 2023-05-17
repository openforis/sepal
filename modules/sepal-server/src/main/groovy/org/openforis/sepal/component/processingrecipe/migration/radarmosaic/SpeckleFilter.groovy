package org.openforis.sepal.component.processingrecipe.migration.radarmosaic

class SpeckleFilter {
    static Map migrate(Map r) {
        def speckleFilter = r.model.options.speckleFilter
        if (speckleFilter == 'QUEGAN') {
            set(r.model.options, 'multitemporalSpeckleFilter', 'QUEGAN')
            set(r.model.options, 'spatialSpeckleFilter', 'LEE')
            set(r.model.options, 'kernelSize', 15)
        } else if (speckleFilter) {
            set(r.model.options, 'spatialSpeckleFilter', speckleFilter)
        }
        set(r.model.options, 'orbitNumbers', 'ALL')
        set(r.model.options, 'kernelSize', 5)
        set(r.model.options, 'sigma', 0.9)
        set(r.model.options, 'strongScatterers', 'RETAIN')
        set(r.model.options, 'strongScattererValues', [0, -5])
        set(r.model.options, 'snicSize', 5)
        set(r.model.options, 'snicCompactness', 0.15)
        set(r.model.options, 'numberOfImages', 10)
        set(r.model.options, 'mask', ['SIDES', 'FIRST_LAST'])
        set(r.model.options, 'minAngle', 30.88)
        set(r.model.options, 'maxAngle', 45.35)
        set(r.model.options, 'minObservations', 1)
        set(r.model.options, 'spatialSpeckleFilter', 'NONE')
        set(r.model.options, 'multitemporalSpeckleFilter', 'NONE')
        r.model.options.remove('speckleFilter')
        return r
    }

    static void set(object, name, value) {
        if (object[name] == null) {
            object[name] = value
        }
    }
}
