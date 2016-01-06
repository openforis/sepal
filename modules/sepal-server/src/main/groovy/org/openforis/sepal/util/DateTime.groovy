package org.openforis.sepal.util

import java.text.SimpleDateFormat

class DateTime {

    static SimpleDateFormat DATE_ONLY_DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd")
    static SimpleDateFormat EARTH_EXPLORER_DATE_FORMAT = new SimpleDateFormat("yyyy:DDD:HH:mm:ss")
    static SimpleDateFormat JSON_DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ")

    static String todayDateString() { toDateString(new Date()) }

    static String toDateString(Date date) { formatDate(date, DATE_ONLY_DATE_FORMAT) }

    static String toJsonDateString(Date date) { formatDate(date, JSON_DATE_FORMAT) }

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

    static Date parseJsonDateFormat(String dateString) { JSON_DATE_FORMAT.parse(dateString) }

    static Date parseDateString(String dateString) { DATE_ONLY_DATE_FORMAT.parse(dateString) }

    static Date parseEarthExplorerDateString(String dateString) { EARTH_EXPLORER_DATE_FORMAT.parse(dateString) }

    private static String formatDate(Date date, SimpleDateFormat format) { format.format(date) }


}
