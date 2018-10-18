package org.openforis.sepal.util.annotation

import groovy.transform.AnnotationCollector
import groovy.transform.AnnotationCollectorMode
import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import groovy.transform.ToString

//@EqualsAndHashCode
//@ToString(includeSuperProperties = true, includePackage = false, includeNames = true)
//@Canonical
//@AnnotationCollector(mode = AnnotationCollectorMode.PREFER_EXPLICIT)
//@AnnotationCollector(mode = AnnotationCollectorMode.PREFER_EXPLICIT, value = [EqualsAndHashCode, ToString, Canonical])
@interface Data {}
