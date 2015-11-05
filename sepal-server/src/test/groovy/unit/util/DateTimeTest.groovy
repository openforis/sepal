package unit.util

import org.openforis.sepal.util.DateTime
import spock.lang.Specification

class DateTimeTest extends Specification {

    def 'given an EarthExplorer formatted date, the parser will correctly extract a java.util.Date'() {
        when:
            def strDate = "2015:263:23:59:22.3208020"
            Date date = DateTime.parseEarthExplorerDateString(strDate)
            Calendar cal = Calendar.getInstance()
            cal.setTime(date)
        then:
            date
            date as Date
            cal.get(Calendar.DAY_OF_YEAR) == 263
            cal.get(Calendar.YEAR) == 2015
            cal.get(Calendar.HOUR_OF_DAY) == 23
            cal.get(Calendar.MINUTE) == 59
            cal.get(Calendar.SECOND) == 22
    }
}
