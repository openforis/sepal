package unit.util

import org.openforis.sepal.util.DateTime
import spock.lang.Specification
import spock.lang.Unroll

import java.text.SimpleDateFormat

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

    @Unroll
    def 'daysFromDayOfYear(#dateString, #dayOfYear) == #expectedDays'() {
        def date = parseDateTimeString(dateString)
        expect:
        DateTime.daysFromDayOfYear(date, dayOfYear) == expectedDays
        where:
        dateString            | dayOfYear | expectedDays
        '2016-01-01'          | '01-01'   | 0
        '2016-01-01'          | '01-02'   | 1
        '2016-01-01'          | '12-31'   | 1
        '2016-01-01 00:00:00' | '01-01'   | 0
        '2016-01-01 23:59:59' | '01-01'   | 0

    }

    Date parseDateTimeString(String dateString) {
        if (dateString.length() == 'yyyy-MM-dd'.length())
            return new SimpleDateFormat('yyyy-MM-dd').parse(dateString)
        else
            return new SimpleDateFormat('yyyy-MM-dd HH:mm:ss').parse(dateString)
    }
}
