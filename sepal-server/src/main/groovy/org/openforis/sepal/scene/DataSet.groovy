package org.openforis.sepal.scene

enum DataSet {
    LANDSAT_8(1),
    LANDSAT_ETM_SLC_OFF(2),
    LANDSAT_ETM(3),
    LANDSAT_TM(4),
    LANDSAT_MSS(5),
    LANDSAT_MSS1(6),
    LANDSAT_COMBINED(7),
    LANDSAT_COMBINED78(8),
    PLANET_LAB_SCENES(9)


    private final int id

    DataSet(int id) {
        this.id = id
    }

    public static DataSet byId(int id) {
        values().find { it.id == id }
    }
}