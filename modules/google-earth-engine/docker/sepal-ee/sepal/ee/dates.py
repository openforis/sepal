from datetime import datetime, timedelta

import six
from dateutil.parser import parse


def to_date(d):
    if isinstance(d, (int, long, float)):
        return datetime.fromtimestamp(d / 1000)
    elif isinstance(d, six.string_types):
        return parse(d)
    return d


def subtract_days(d, days):
    return to_date(d) - timedelta(days=days)

def add_days(d, days):
    return to_date(d) + timedelta(days=days)
