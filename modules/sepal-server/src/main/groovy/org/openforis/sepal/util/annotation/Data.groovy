package org.openforis.sepal.util.annotation

import groovy.transform.AnnotationCollector
import groovy.transform.Canonical
import groovy.transform.EqualsAndHashCode
import groovy.transform.ToString

@EqualsAndHashCode
@ToString(includeSuperProperties = true, includePackage = false, includeNames = true)
@Canonical
@AnnotationCollector
@interface Data {}
