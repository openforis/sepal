package org.openforis.sepal.util

import groovy.time.TimeCategory

import java.text.SimpleDateFormat
import java.time.ZoneId
import java.time.temporal.ChronoField

import static java.time.temporal.ChronoField.MONTH_OF_YEAR

class DateTime {
    private static final DATE_ONLY_DATE_FORMAT = 'yyyy-MM-dd'
    private static final DATE_TIME_DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss'
    private static final EARTH_EXPLORER_DATE_FORMAT = 'yyyy:DDD:HH:mm:ss'

    static String toDateString(Date date) { formatDate(date, new SimpleDateFormat(DATE_ONLY_DATE_FORMAT)) }

    static String toUtcString(Date date) {
        TimeZone timeZone = TimeZone.getTimeZone("UTC")
        def dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm'Z'")
        dateFormat.timeZone = timeZone
        return dateFormat.format(date)
    }

    static String toDateTimeString(Date date) { formatDate(date, new SimpleDateFormat(DATE_TIME_DATE_FORMAT)) }

    static Date add(Date date, int field, int amount) {
        def cal = Calendar.getInstance()
        cal.setTime(date)
        cal.add(field, amount)
        return cal.time
    }

    static Date parseDateString(String dateString) {
        new SimpleDateFormat(DATE_ONLY_DATE_FORMAT).parse(dateString)
    }

    static Date parseEarthExplorerDateString(String dateString) {
        new SimpleDateFormat(EARTH_EXPLORER_DATE_FORMAT).parse(dateString)
    }

    static Date firstOfMonth(Date date) {
        def zone = ZoneId.systemDefault()
        def local = date.toInstant().atZone(zone).withDayOfMonth(1).toLocalDate().atStartOfDay(zone).toInstant()
        return Date.from(local)
    }

    static Date startOfDay(Date date) {
        def zone = ZoneId.systemDefault()
        def local = date.toInstant().atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()
        return Date.from(local)
    }

    static double hoursBetween(Date from, Date to) {
        return (to.time - from.time) / 1000d / 60d / 60d
    }

    static int monthOfYear(Date date) {
        get(date, MONTH_OF_YEAR)
    }

    static int year(Date date) {
        get(date, ChronoField.YEAR)
    }

    static int daysInMonth(int year, int month) {
        Calendar calendar = new GregorianCalendar(year, month - 1, 1)
        calendar.getActualMaximum(Calendar.DAY_OF_MONTH)
    }

    /**
     * Determines the number of dates between the date and the provided day of year
     * @param date the date
     * @param dayOfYear the day of the year
     * @return the days between the date and the day of year.
     */
    static int daysFromDayOfYear(Date date, int dayOfYear) {
        def dateDayOfYear = new SimpleDateFormat('D').format(date).toInteger()
        def days = Math.abs(dateDayOfYear - dayOfYear)
        return [days, 365 - days].min()
    }

    private static daysBetween(Date date1, Date date2) {
        use(TimeCategory) {
            return Math.abs((startOfDay(date1) - startOfDay(date2)).days)
        }
    }

    private static int get(Date date, ChronoField field) {
        def zone = ZoneId.systemDefault()
        date.toInstant().atZone(zone).toLocalDate().get(field)
    }

    private static String formatDate(Date date, SimpleDateFormat format) { format.format(date) }

    static boolean sameYearAndMonth(Date date1, Date date2) {
        year(date1) == year(date2) && monthOfYear(date1) == monthOfYear(date2)
    }
}
