package org.openforis.sepal.component.user.api

import java.util.regex.Pattern

class Email {
    private final static Pattern EMAIL_PATTERN = Pattern.compile("\\b[A-Z0-9._%-]+@[A-Z0-9.-]+\\.[A-Z]{2,4}\\b");

    static boolean isValid(email) {
        def matcher = EMAIL_PATTERN.matcher(email)
        return matcher.matches()
    }
}
