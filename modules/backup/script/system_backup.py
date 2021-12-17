import re
import subprocess

import sys
from datetime import timedelta
from dateutil.parser import parse
from itertools import groupby


def find_dates_to_prune(dates):
    return find_tail_in_group(dates, None, timedelta(weeks=52), lambda day: day.year) \
           + find_tail_in_group(dates, timedelta(weeks=52), timedelta(weeks=4), lambda day: day.month) \
           + find_tail_in_group(dates, timedelta(weeks=4), timedelta(weeks=1), lambda day: week(day))


def week(day):
    return day.isocalendar()[1]


def find_tail_in_group(dates, from_delta, to_delta, group_fun):
    last_day = dates[-1]
    if from_delta:
        from_date = last_day - from_delta
    else:
        from_date = None
    to_date = last_day - to_delta
    dates = [
        day
        for day in dates
        if day <= to_date and (not from_delta or from_date < day)
    ]
    to_prune = []
    for time, days in groupby(dates, group_fun):
        days = list(days)
        if len(days) > 1:
            to_prune.extend(days[1:])
    return to_prune


def list_backup_dates(bucket):
    try:
        response = execute('aws s3 ls s3://%s/system/' % bucket)
    except:
        return []
    return [
        to_date(day)
        for day in re.findall('\d\d\d\d-\d\d-\d\d', response)
    ]


def to_date(date_str):
    return parse(date_str).date()


def backup(bucket, backup_date, dates, dirs):
    backup_date_str = backup_date.isoformat()
    if dates and backup_date not in dates:
        execute(('aws s3 cp s3://%s/system/%s s3://%s/system/%s --recursive' % (
        bucket, dates[-1], bucket, (backup_date_str))))
    for dir in dirs:
        parts = dir.split(':')
        execute(('aws s3 sync %s s3://%s/system/%s/%s --delete' % (parts[0], bucket, backup_date_str, parts[1])))
    return dates + [backup_date]


def prune(bucket, day):
    execute(('aws s3 rm s3://%s/system/%s --recursive' % (bucket, day)))


def execute(command):
    print('Executing ' + command)
    return subprocess.check_output(command.split(' '))


if len(sys.argv) < 3:
    sys.exit('Requires at least two arguments: S3 bucket name and date to make backup for')

bucket = sys.argv[1]
backup_date = to_date(sys.argv[2])
dirs = sys.argv[3:]
dates = list_backup_dates(bucket)
dates = backup(bucket, backup_date, dates, dirs)
for day in find_dates_to_prune(dates):
    prune(bucket, day.isoformat())
