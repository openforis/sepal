package org.openforis.sepal.component.processingrecipe.migration.v3

class V3Migration {
    public static final String COUNTRY_FUSION_TABLE = '1iCjlLvNDpVtI80HpYrxEtjnw2w6sLEHX0QVTLqqU'
    public static final String COUNTRY_EE_TABLE = 'users/wiell/SepalResources/countries'

    static Map migrate(Map r) {
        if (r.model.aoi)
            updateAoi(r.model.aoi)
        return r
    }

    static void updateAoi(aoi) {
        if (aoi.type == 'FUSION_TABLE' && aoi.id == COUNTRY_FUSION_TABLE) {
            aoi.type = 'EE_TABLE'
            aoi.id = COUNTRY_EE_TABLE
        }
    }
}
