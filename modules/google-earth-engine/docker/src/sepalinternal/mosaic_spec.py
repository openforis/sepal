import logging
from abc import abstractmethod

import ee

from .aoi import Aoi
from .dates import parse_date, day_of_year, add_years, to_millis, milis_per_day
from .image_spec import ImageSpec
from .mosaic import Mosaic


class MosaicSpec(ImageSpec):
    def __init__(self, spec):
        super(MosaicSpec, self).__init__()
        recipe = spec['recipe']
        model = recipe['model']
        dates = model['dates']
        bands = spec.get('bands', {})
        self.spec = spec
        self.aoi = Aoi.create(model['aoi'])
        self.target_date = parse_date(dates['targetDate'])
        self.season_start = parse_date(dates['seasonStart'])
        self.season_end = parse_date(dates['seasonEnd'])
        self.years_before = int(dates['yearsBefore'])
        self.years_after = int(dates['yearsAfter'])
        self.target_day = day_of_year(parse_date(dates['targetDate']))
        self.from_date = add_years(parse_date(dates['seasonStart']), - int(dates['yearsBefore']))
        self.to_date = add_years(parse_date(dates['seasonEnd']), int(dates['yearsAfter']))
        self.target_day_weight = self._filter('DAY_OF_YEAR')
        self.shadow_tolerance = 1 - self._filter('SHADOW')
        self.haze_tolerance = 1 - self._filter('HAZE')
        self.greenness_weight = self._filter('NDVI')
        self.bands = bands.get('selection', [])
        composite_options = model['compositeOptions']
        self.median_composite = composite_options['compose'] == 'MEDIAN'
        self.mask_clouds = 'CLOUDS' in composite_options['mask']
        self.mask_snow = 'SNOW' in composite_options['mask']
        self.cloud_buffer = composite_options.get('cloudBuffer', 0)
        self.brdf_correct = 'BRDF' in composite_options['corrections']
        self.surface_reflectance = 'SR' in composite_options['corrections']
        self.pan_sharpen = bool(bands.get('panSharpen', False))
        self.scale = spec.get('scale')

    def _viz_params(self):
        viz_by_band = _sr_viz_by_bands if self.surface_reflectance else _toa_viz_by_bands
        return viz_by_band[', '.join(self.bands)]({
            'from_days_since_epoch': to_millis(self.from_date) / milis_per_day,
            'to_days_since_epoch': to_millis(self.to_date) / milis_per_day
        })

    def _ee_image(self):
        return Mosaic(self).create(self._data_sets())

    def _date_filter(self):
        def filter(year_diff):
            return ee.Filter.date(
                add_years(self.season_start, year_diff),
                add_years(self.season_end, year_diff)
            )

        filters = ee.Filter.Or(
            [filter(0)]
            + [filter(-(i + 1)) for i in range(0, self.years_before)]
            + [filter(i + 1) for i in range(0, self.years_after)]
        )
        return filters

    @abstractmethod
    def _data_sets(self):
        raise AssertionError('Method in subclass expected to have been invoked')

    def _filter(self, type):
        filters_of_type = [filter for filter in self.spec['recipe']['model']['compositeOptions']['filters'] if
                           filter['type'] == type]
        filter = filters_of_type[0] if len(filters_of_type) else None
        return _to_float(filter, 'percentile', 0) / 100


_toa_viz_by_bands = {
    'red, green, blue': lambda params: {
        'bands': 'red,green,blue',
        'min': '200, 400, 600',
        'max': '2400, 2200, 2400',
        'gamma': 1.2},
    'nir, red, green': lambda params: {
        'bands': 'nir,red,green',
        'min': '500, 200, 400',
        'max': '5000, 2400, 2200'},
    'nir, swir1, red': lambda params: {
        'bands': 'nir,swir1,red',
        'min': 0,
        'max': 5000,
        'gamma': 1.5},
    'swir2, nir, red': lambda params: {
        'bands': 'swir2,nir,red',
        'min': '0, 500, 200',
        'max': '1800, 6000, 3500'},
    'swir2, swir1, red': lambda params: {
        'bands': 'swir2,swir1,red',
        'min': '0, 500, 200',
        'max': '1800, 3000, 2400'},
    'swir2, nir, green': lambda params: {
        'bands': 'swir2,nir,green',
        'min': '0, 500, 400',
        'max': '1800, 6000, 3500'},
    'brightness, greenness, wetness': lambda params: {
        'bands': 'brightness,greenness,wetness',
        'min': '1000, -1000, -1800',
        'max': '7000, 1800, 3200'},
    'unixTimeDays': lambda params: {
        'bands': 'unixTimeDays',
        'min': params['from_days_since_epoch'],
        'max': params['to_days_since_epoch'],
        'palette': '00FFFF, 000099'
    },
    'dayOfYear': lambda params: {
        'bands': 'dayOfYear',
        'min': 0,
        'max': 366,
        'palette': '00FFFF, 000099'
    },
    'daysFromTarget': lambda params: {
        'bands': 'daysFromTarget',
        'min': 0,
        'max': 183,
        'palette': '00FF00, FF0000'
    },
}

_sr_viz_by_bands = {
    'red, green, blue': lambda params: {
        'bands': 'red,green,blue',
        'min': '300, 100, 0',
        'max': '2500, 2500, 2300',
        'gamma': 1.3},
    'nir, red, green': lambda params: {
        'bands': 'nir,red,green',
        'min': '500, 200, 100',
        'max': '5000, 2400, 2500'},
    'nir, swir1, red': lambda params: {
        'bands': 'nir,swir1,red',
        'min': 0,
        'max': '5000, 5000, 3000',
        'gamma': 1.3},
    'swir2, nir, red': lambda params: {
        'bands': 'swir2,nir,red',
        'min': '100, 500, 300',
        'max': '2000, 6000, 2500'},
    'swir2, swir1, red': lambda params: {
        'bands': 'swir2,swir1,red',
        'min': '100, 200, 300',
        'max': '3300, 4800, 3100'},
    'swir2, nir, green': lambda params: {
        'bands': 'swir2,nir,green',
        'min': '100, 500, 400',
        'max': '3300, 7500, 3000'},
    'brightness, greenness, wetness': lambda params: {
        'bands': 'brightness,greenness,wetness',
        'min': '1000, -1000, -1800',
        'max': '7000, 1800, 3200'},
    'unixTimeDays': lambda params: {
        'bands': 'unixTimeDays',
        'min': params['from_days_since_epoch'],
        'max': params['to_days_since_epoch'],
        'palette': '00FFFF, 000099'
    },
    'dayOfYear': lambda params: {
        'bands': 'dayOfYear',
        'min': 0,
        'max': 183,
        'palette': '00FFFF, 000099'
    },
    'daysFromTarget': lambda params: {
        'bands': 'daysFromTarget',
        'min': 0,
        'max': 183,
        'palette': '00FF00, FF0000'
    },
}

_milis_per_day = 1000 * 60 * 60 * 24


def _to_float(spec, key, default):
    return float(_get(default, key, spec))


def _to_int(spec, key, default):
    return int(_get(default, key, spec))


def _get(default, key, spec):
    if not spec:
        return 0
    value = spec.get(key, default)
    if value == None or value == '':
        value = default
    return value
