import calendar
import numbers
from datetime import datetime, timedelta

import six
from dateutil.parser import parse


def to_date(d):
    if isinstance(d, numbers.Number):
        return datetime.fromtimestamp(d / 1000)
    elif isinstance(d, six.string_types):
        return parse(d)
    return d


def subtract_days(d, days):
    return to_date(d) - timedelta(days=days)


def add_days(d, days):
    return to_date(d) + timedelta(days=days)


def add_months(d, months):
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)


def subtract_months(d, months):
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return datetime.datetime(year, month, day)
