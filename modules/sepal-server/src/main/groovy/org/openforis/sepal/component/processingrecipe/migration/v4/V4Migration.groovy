package org.openforis.sepal.component.processingrecipe.migration.v4

class V4Migration {
    public static final String COUNTRY_FUSION_TABLE = '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU'
    public static final String COUNTRY_EE_TABLE = 'users/wiell/SepalResources/countries'

    static Map migrate(Map r) {
        if (r.model.compositeOptions)
            updateCompositeOptions(r.model.compositeOptions)
        return r
    }

    static void updateCompositeOptions(compositeOptions) {
        def mask = compositeOptions.mask ?: []
        compositeOptions.snowMasking = 'SNOW' in mask ? 'ON' : 'OFF'
        compositeOptions.cloudMasking = 'CLOUDS' in mask ? 'AGGRESSIVE' : 'OFF'
    }
}
