package unit.util

import org.openforis.sepal.util.RegExpr
import spock.lang.Specification


class RegExprTest extends Specification{

    def 'testing RegExpr match method'(){
        given:
        def pattern = "^[a-zA-Z0-9]+\$"
        def matcher = "ciao9823940Amore"
        def matcher2 = "validRequestName"
        def matcher3 = "445"
        def matcher4 = "valid"
        def matcher5 = "FOLDER"
        def wrong = "ciao_amore"
        when:

        def resultWrong = RegExpr.match(pattern,wrong)
        then:
        RegExpr.match(pattern,matcher)
        RegExpr.match(pattern,matcher2)
        RegExpr.match(pattern,matcher3)
        RegExpr.match(pattern,matcher4)
        RegExpr.match(pattern,matcher5)
        !resultWrong
    }
}
