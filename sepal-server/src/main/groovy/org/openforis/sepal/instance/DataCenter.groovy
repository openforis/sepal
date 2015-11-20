package org.openforis.sepal.instance

import groovy.transform.ToString

@ToString
class DataCenter {

    long id
    String name
    String geolocation
    String description
    InstanceProvider provider
}
