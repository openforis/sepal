package org.openforis.sepal.util.annotation

import groovy.transform.AnnotationCollector
import groovy.transform.AnnotationCollectorMode
import groovy.transform.EqualsAndHashCode
import groovy.transform.Immutable
import groovy.transform.ToString

//@Immutable
//@EqualsAndHashCode
//@ToString(includeSuperProperties = true, includePackage = false, includeNames = true)
//@AnnotationCollector(mode = AnnotationCollectorMode.PREFER_EXPLICIT, value = [Immutable, EqualsAndHashCode, ToString])
@interface ImmutableData {}
