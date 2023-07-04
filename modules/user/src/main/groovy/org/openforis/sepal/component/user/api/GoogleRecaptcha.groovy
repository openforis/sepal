package org.openforis.sepal.component.user.api

import groovyx.net.http.RESTClient

interface GoogleRecaptcha {
    boolean isValid(String token, String action)
}
