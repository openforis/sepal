package org.openforis.sepal.model

import groovy.transform.Immutable

@Immutable
class User {
    long id
    String username
    String fullName
    String email
}
