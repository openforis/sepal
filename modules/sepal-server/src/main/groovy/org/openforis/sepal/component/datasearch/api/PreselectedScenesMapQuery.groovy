package org.openforis.sepal.component.datasearch.api

import groovy.transform.Canonical

@Canonical
class PreselectedScenesMapQuery {
    String source
    List<String> sceneIds
    Aoi aoi
    int targetDayOfYear
    double targetDayOfYearWeight
    double shadowTolerance
    double hazeTolerance
    double greennessWeight
    boolean medianComposite
    boolean brdfCorrect
    boolean maskClouds
    boolean maskSnow
    List<String> bands
    boolean panSharpening
}
