package org.openforis.sepal.util

import java.util.regex.Pattern


class RegExpr {

    static Boolean match(String regex, String input) {
        Is.notNull(regex)
        Is.notNull(input)
        def pattern = Pattern.compile(regex)
        def matcher = pattern.matcher(input)
        return matcher.matches()
    }
}
