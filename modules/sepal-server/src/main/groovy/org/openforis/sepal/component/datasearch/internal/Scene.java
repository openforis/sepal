package org.openforis.sepal.component.datasearch.internal;

import java.util.Date;
import java.util.List;

public class Scene {
    public final String id;
    public final Date date;
    public final double cloudCover;
    public final List<List<Double>> footprint;

    public Scene(String id, Date date, double cloudCover, List<List<Double>> footprint) {
        this.id = id;
        this.date = date;
        this.cloudCover = cloudCover;
        this.footprint = footprint;
    }

    public String toString() {
        return id;
    }
}
