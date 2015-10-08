package org.openforis.sepal.util

import java.text.SimpleDateFormat


class DateTime {

    static SimpleDateFormat DATE_ONLY_DATE_FORMAT = new SimpleDateFormat("yyyy-MM-dd")
    static SimpleDateFormat EARTH_EXPLORER_DATE_FORMAT = new SimpleDateFormat("yyyy:DDD:HH:mm:ss")

    static String todayDateString() { toDateString(new Date()) }

    static String toDateString(Date date) { formatDate(date, DATE_ONLY_DATE_FORMAT) }

    static String toDateString(Date date, int daysToAdd) { toDateString(addDays(date, daysToAdd)) }


    static Date addDays(Date date, int days) {
        Calendar calendar = new GregorianCalendar()
        calendar.setTime(date)
        calendar.add(Calendar.DATE, days)
        return calendar.getTime()
    }

    static Date parseDateString(String dateString) { DATE_ONLY_DATE_FORMAT.parse(dateString) }

    static Date parseEarthExplorerDateString(String dateString) { EARTH_EXPLORER_DATE_FORMAT.parse(dateString) }

    private static String formatDate(Date date, SimpleDateFormat format) { format.format(date) }


}
