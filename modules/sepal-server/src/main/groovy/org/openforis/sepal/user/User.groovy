package org.openforis.sepal.user

import groovy.transform.ToString


@ToString
class User {

    Long id
    String username
    Long monthlyQuota
    Long userUid
}
