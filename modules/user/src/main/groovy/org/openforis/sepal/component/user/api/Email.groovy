package org.openforis.sepal.component.user.api

import java.util.regex.Pattern

class Email {
    private final static Pattern EMAIL_PATTERN = Pattern.compile(
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    )

    static boolean isValid(String email) {
        def matcher = EMAIL_PATTERN.matcher(email)
        return matcher.matches()
    }
}
