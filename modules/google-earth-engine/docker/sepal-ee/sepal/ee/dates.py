import calendar
from datetime import date, datetime, timedelta
from typing import Union
import ee

from dateutil.parser import parse


def to_date(d: Union[int, str, date]) -> date:
    if isinstance(d, int):
        return datetime.fromtimestamp(d / 1000).date()
    elif isinstance(d, str):
        return parse(d).date()
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
    return date(year, month, day)


def subtract_months(d, months):
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return datetime(year, month, day)


def split_range_by_year(start_date, end_date):
    start_date = to_date(start_date)
    end_date = to_date(end_date)
    start_year = start_date.year
    end_year = add_days(end_date, -1).year  # -1 day since exclusive date
    return [(
        date(year, 1, 1) if year != start_year else start_date,
        date(year + 1, 1, 1) if year != end_year else end_date
    ) for year in range(start_year, end_year + 1)]


def map_days(start_date, end_date, callback):
    start_date = to_date(start_date)
    end_date = to_date(end_date)
    d = start_date
    collected = []
    while d < end_date:
        collected.append(callback(d))
        d = add_days(d, 1)
    return collected


def to_ee_date(d):
    return ee.Date(datetime.combine(to_date(d), datetime.min.time()))
