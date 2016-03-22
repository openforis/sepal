package org.openforis.sepal.util

import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoField

import static java.time.temporal.ChronoField.MONTH_OF_YEAR
import static java.time.temporal.ChronoField.YEAR

class DateTime {

    static SimpleDateFormat DATE_ONLY_DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd")
    static SimpleDateFormat EARTH_EXPLORER_DATE_FORMAT = new SimpleDateFormat("yyyy:DDD:HH:mm:ss")

    static String todayDateString() { toDateString(new Date()) }

    static String toDateString(Date date) { formatDate(date, DATE_ONLY_DATE_FORMAT) }

    static Date addDays(Date date, int days) {
        Calendar calendar = new GregorianCalendar()
        calendar.setTime(date)
        calendar.add(Calendar.DATE, days)
        return calendar.getTime()
    }

    static Date add(Date date, int field, int amount) {
        def cal = Calendar.getInstance()
        cal.setTime(date)
        cal.add(field, amount)
        return cal.time
    }

    static Date parseDateString(String dateString) { DATE_ONLY_DATE_FORMAT.parse(dateString) }

    static Date parseEarthExplorerDateString(String dateString) { EARTH_EXPLORER_DATE_FORMAT.parse(dateString) }

    static Date firstOfMonth(Date date) {
        def zone = ZoneId.systemDefault()
        def local = date.toInstant().atZone(zone).withDayOfMonth(1).toLocalDate().atStartOfDay(zone).toInstant()
        return Date.from(local)
    }

    static hoursBetween = { Date from, Date to ->
        return (to.time - from.time) / 1000 / 60 / 60
    }

    static int monthOfYear(Date date) {
        get(date, MONTH_OF_YEAR)
    }

    static int year(Date date) {
        get(date, YEAR)
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
