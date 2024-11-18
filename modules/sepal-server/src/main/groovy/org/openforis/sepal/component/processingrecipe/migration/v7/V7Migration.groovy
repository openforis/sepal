package org.openforis.sepal.component.processingrecipe.migration.v7

class V7Migration {
    static Map migrate(Map r) {
        def compositeOptions = r?.model?.compositeOptions
        def optionsKey = r?.model?.compositeOptions ? 'compositeOptions' : 'options'
        def options = r.model[optionsKey]
        if (options) {
            def cloudMasking = options.cllutMasking
            def cloudDetection = options.cloudDetection
            r.model[optionsKey] = options + [
                brdfMultiplier: 4,
                includedCloudMasking: 
                    ('QA' in cloudDetection ? ['landsatCFMask', 'sentinel2CloudProbability'] : []) + 
                    ('CLOUD_SCORE' in cloudDetection ? ['sepalCloudScore'] : []) + 
                    ('PINO_26' in cloudDetection ? ['pino26'] : []),
                landsatCFMaskCloudMasking: 'MODERATE',
                landsatCFMaskCloudShadowMasking: 'MODERATE',
                landsatCFMaskCirrusMasking: 'MODERATE',
                landsatCFMaskDilatedCloud: 'REMOVE',
                sentinel2CloudProbabilityMaxCloudProbability: cloudMasking == 'AGGRESSIVE' ? 30 : 65,
                sentinel2CloudScorePlusBand: cloudMasking == 'AGGRESSIVE' ? 'cs' : 'cs_cdf',
                sentinel2CloudScorePlusMaxCloudProbability: cloudMasking == 'AGGRESSIVE' ? 35 : 45,
                sepalCloudScoreMaxCloudProbability: cloudMasking == 'AGGRESSIVE' ? 25 : 30,
                holes: cloudMasking == 'OFF' ? 'PREVENT' : 'ALLOW',
                cloudThreshold: cloudMasking == 'AGGRESSIVE' ? 0.25 : 1,
                shadowThreshold: 0.4,
            ]
            println(r.model.options)
        }
        return r
    }
}
