from datetime import datetime

epoch = datetime.utcfromtimestamp(0)
milis_per_day = 1000 * 60 * 60 * 24


def parse_date(date_string):
    return datetime.strptime(date_string, '%Y-%m-%d')


def day_of_year(date):
    return date.timetuple().tm_yday


def add_years(date, years):
    new_year = date.year + years
    try:
        return date.replace(year=new_year)
    except ValueError:
        if (date.month == 2 and date.day == 29 and  # leap day
                isleap(date.year) and not isleap(new_year)):
            return date.replace(year=new_year, day=28)
        raise


def to_millis(date):
    return (date - epoch).total_seconds() * 1000.0


def millis_to_date(millis):
    return datetime.fromtimestamp(millis / 1000)
