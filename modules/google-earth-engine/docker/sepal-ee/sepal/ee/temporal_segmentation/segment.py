import ee
import sys

from . import date_conversion, harmonic_fit


class Segment(object):
    def __init__(self, segmentImage, dateFormat, defaultDate):
        self.segmentImage = segmentImage
        self.dateFormat = dateFormat
        self.defaultDate = defaultDate

    # TODO: Fix
    # defaultT = toT(defaultDate) || segmentImage.expression('(i.tStart + i.tEnd) / 2',:i: segmentImage)

    def fit(self, date, t, harmonics=3, extrapolateMaxDays=0, extrapolateMaxFraction=0):
        t = ee.Image(self.toT(date) if date else t)
        tStart = self.segmentImage.select('tStart')
        tEnd = self.segmentImage.select('tEnd')
        extrapolateMaxDays = date_conversion.days(tStart, tEnd, self.dateFormat).multiply(
            extrapolateMaxFraction).round() \
            if extrapolateMaxFraction else ee.Image(extrapolateMaxDays)
        extrapolateMaxDays = extrapolateMaxDays.where(extrapolateMaxDays.lt(0), ee.Image(sys.maxint))

        daysFromStart = date_conversion.days(t, tStart, self.dateFormat)
        daysFromEnd = date_conversion.days(tEnd, t, self.dateFormat)
        daysFromSegment = daysFromStart \
            .max(daysFromEnd) \
            .max(0)

        coefs = self.segmentImage.select('.*_coefs')
        return harmonic_fit.fitImage(coefs, t, self.dateFormat, harmonics) \
            .updateMask(extrapolateMaxDays.gte(daysFromSegment))

    def startFit(self, harmonics):
        return self.fit(t=self.segmentImage.select('tStart'), harmonics=harmonics)

    def endFit(self, harmonics):
        return self.fit(t=self.segmentImage.select('tEnd'), harmonics=harmonics)

    def middleFit(self, harmonics):
        t = self.segmentImage.expression('i.tStart + (i.tEnd - i.tStart) / 2', {'i': self.segmentImage})
        return self.fit(t=t, harmonics=harmonics)

    def mean(self, harmonics):
        return harmonic_fit.meanImage(
            self.segmentImage.select('.*_coefs'),
            self.segmentImage.select('tStart'),
            self.segmentImage.select('tEnd'),
            self.dateFormat,
            harmonics
        )

    def toT(self, date):
        return date_conversion.toT(date, self.dateFormat)

    def fromT(self, t):
        return date_conversion.fromT(t, self.dateFormat)

    def coefs(self, bandName):
        return ee.Image(
            range(0, 8).map(
                lambda coefIndex: self.segmentImage \
                    .select(ee.String(bandName).cat('_coefs')) \
                    .arrayGet([coefIndex]) \
                    .rename(ee.String(bandName).cat('_coef_' + coefIndex))
            )
        )

    def phase(self, harmonic=1):
        coefs = self.segmentImage.select('.*_coefs')
        return coefs.arrayGet([ee.Number(harmonic).multiply(2)]) \
            .atan2(coefs.arrayGet([ee.Number(harmonic).multiply(2).add(1)])) \
            .regexpRename('(.*)_coefs', '$1_phase')

    def amplitude(self, harmonic=1):
        coefs = self.segmentImage.select('.*_coefs')
        return coefs.arrayGet([ee.Number(harmonic).multiply(2)]) \
            .hypot(coefs.arrayGet([ee.Number(harmonic).multiply(2).add(1)])) \
            .regexpRename('(.*)_coefs', '$1_amplitude')

    def toImage(self, selector='.*'):
        return self.segmentImage.select(selector)
