package org.openforis.sepal.scene

enum DataSet {
    LANDSAT_7(2),
    LANDSAT_8(1)

    private final int id

    DataSet(int id) {
        this.id = id
    }

    public static DataSet byId(int id) {
        values().find { it.id == id }
    }
}