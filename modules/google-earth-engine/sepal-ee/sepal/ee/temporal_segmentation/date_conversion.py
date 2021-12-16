import ee

J_DAYS = 0
FRACTIONAL_YEARS = 1
UNIX_TIME_MILLIS = 2


def toT(date, dateFormat):
    date = ee.Date(date)
    if dateFormat == J_DAYS:
        epochDay = 719529
        return date.millis().divide(1000).divide(3600).divide(24).add(epochDay)
    elif dateFormat == FRACTIONAL_YEARS:
        return date.get('year').add(date.getFraction('year'))
    elif dateFormat == UNIX_TIME_MILLIS:
        return date.millis()
    else:
        raise Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')


def fromT(t, dateFormat):
    t = ee.Number(t)
    if dateFormat == J_DAYS:
        epochDay = 719529
        return ee.Date(ee.Number(t.subtract(epochDay).multiply(1000).multiply(3600).multiply(24)))
    elif dateFormat == FRACTIONAL_YEARS:
        firstOfYear = ee.Date.fromYMD(t.floor(), 1, 1)
        firstOfNextYear = firstOfYear.advance(1, 'year')
        daysInYear = firstOfNextYear.difference(firstOfYear, 'day')
        dayOfYear = daysInYear.multiply(t.mod(1)).floor()
        return firstOfYear.advance(dayOfYear, 'day')
    elif dateFormat == UNIX_TIME_MILLIS:
        return ee.Date(t)
    else:
        raise Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')


def days(t1, t2, dateFormat):
    diff = t2.subtract(t1)

    if dateFormat == J_DAYS:
        return diff
    elif dateFormat == FRACTIONAL_YEARS:
        return diff.multiply(365).round()
    elif dateFormat == UNIX_TIME_MILLIS:
        return diff.divide(1000 * 3600 * 24).round()
    else:
        raise Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
