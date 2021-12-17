import ee
import math

J_DAYS = 0
FRACTIONAL_YEARS = 1
UNIX_TIME_MILLIS = 2


def fitImage(coefs, t, dateFormat, harmonics):
    return ee.ImageCollection(
        fit(t, dateFormat, harmonics, lambda index: coefs.arrayGet([index]))
    ) \
        .reduce(ee.Reducer.sum()) \
        .regexpRename('(.*)_coefs_sum', '$1')


def fitNumber(coefs, t, dateFormat, harmonics):
    return fit(t, dateFormat, harmonics, lambda index: ee.Number(coefs.get(index))) \
        .reduce(ee.Reducer.sum())


def meanImage(coefs, tStart, tEnd, dateFormat, harmonics):
    return mean(tStart, tEnd, dateFormat, harmonics, lambda index: coefs.arrayGet([index])) \
        .regexpRename('(.*)_coefs', '$1')


def meanNumber(coefs, tStart, tEnd, dateFormat, harmonics):
    return mean(tStart, tEnd, dateFormat, harmonics, lambda index: ee.Number(coefs.get(index)))


def fit(t, dateFormat=0, harmonics=3, coefExtractor=None):
    def c(index):
        return coefExtractor(index)

    omega = getOmega(dateFormat)
    return ee.List([
        c(0) \
            .add(c(1).multiply(t)),

        c(2).multiply(t.multiply(omega).cos()) \
            .add(c(3).multiply(t.multiply(omega).sin())),

        c(4).multiply(t.multiply(omega * 2).cos()) \
            .add(c(5).multiply(t.multiply(omega * 2).sin())),

        c(6).multiply(t.multiply(omega * 3).cos()) \
            .add(c(7).multiply(t.multiply(omega * 3).sin()))
    ]) \
        .slice(0, ee.Number(harmonics).add(1))


def mean(tStart, tEnd, dateFormat, harmonics=3, coefExtractor=None):
    expressions = [
        'c0 + (c1 * (s    + e) / 2)',
        '1/(e - s) * ((c3 * (cos(w * s) - cos(e * w)) - c2 * (sin(w * s) - sin(e * w)))/w - ((s - e) * (c1 * (s + e) + 2 * c0)) / 2)',
        '1/(e - s) * -(c4 * (sin(2 * w * s) - sin(2 * e * w)) - c5 * (cos(2 * w * s) - cos(2 * e * w)) + 2 * c2 * (sin(w * s) - sin(e * w)) - 2 * c3 * (cos(w * s) - cos(e * w)) + w * (s - e) * (c1 * (s + e) + 2 * c0)) / (2 * w)',
        '1/(e - s) * -(2 * c6 * (sin(3 * w * s) - sin(3 * e * w)) - 2 * c7 * (cos(3 * w * s) - cos(3 * e * w)) + 3 * (c4 * (sin(2 * w * s) - sin(2 * e * w)) + w * (s - e) * (c1 * (s + e) + 2 * c0)) - 3 * c5 * (cos(2 * w * s) - cos(2 * e * w)) + 6 * c2 * (sin(w * s) - sin(e * w)) - 6 * c3 * (cos(w * s) - cos(e * w)))/(6 * w)'
    ]
    return ee.Image().expression(expressions[harmonics], {
        's': tStart,
        'e': tEnd,
        'w': getOmega(dateFormat),
        'c0': coefExtractor(0),
        'c1': coefExtractor(1),
        'c2': coefExtractor(2),
        'c3': coefExtractor(3),
        'c4': coefExtractor(4),
        'c5': coefExtractor(5),
        'c6': coefExtractor(6),
        'c7': coefExtractor(7),
    })


def getOmega(dateFormat):
    if dateFormat == J_DAYS:
        return 2.0 * math.pi / 365.25
    elif dateFormat == FRACTIONAL_YEARS:
        return 2.0 * math.pi
    elif dateFormat == UNIX_TIME_MILLIS:
        return 2.0 * math.pi * 60 * 60 * 24 * 365.25
    else:
        raise Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
