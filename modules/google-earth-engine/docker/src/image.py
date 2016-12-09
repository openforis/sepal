from abc import abstractmethod

from datetime import datetime

import export
import landsat
from aoi import Aoi


class Image(object):
    def __init__(self, aoi):
        self.aoi = aoi

    @staticmethod
    def create(spec):
        type = {
            'preselectedScenesMosaic': PreselectedScenesMosaic,
            'automaticSceneSelectingMosaic': AutomaticSceneSelectingMosaic,
        }[spec['type']]
        return type.create(spec)

    def preview(self):
        ee_image = self._ee_image()
        viz_params = self._viz_params()
        ee_preview = ee_image.getMapId(viz_params)
        return {
            'mapId': ee_preview['mapid'],
            'token': ee_preview['token']
        }

    def download(self, name, username, downloader):
        task = export.to_drive(self._ee_image(), self.aoi.geometry().bounds(), name, username)
        downloader.start_download(task)
        return task

    @abstractmethod
    def _ee_image(self):
        raise AssertionError('Method in subclass expected to have been invoked')

    @abstractmethod
    def _viz_params(self):
        raise AssertionError('Method in subclass expected to have been invoked')


class Mosaic(Image):
    default_strategy = 'median'
    default_fmask_threshold = 1

    def __init__(self, aoi, target_day_of_year, target_day_of_year_weight, bands, strategy, fmask_threshold):
        super(Mosaic, self).__init__(aoi=aoi)
        self.target_day_of_year = target_day_of_year
        self.target_day_of_year_weight = target_day_of_year_weight
        self.bands = bands
        self.strategy = strategy
        self.fmask_threshold = fmask_threshold

    _viz_by_bands = {
        'B3, B2, B1': lambda params: {'bands': 'B3, B2, B1', 'min': 500, 'max': 5000, 'gamma': '2.1, 2.0, 1.7'},
        'B4, B3, B2': lambda params: {'bands': 'B4, B3, B2', 'min': 200, 'max': 5000, 'gamma': 1.2},
        'B4, B5, B3': lambda params: {'bands': 'B4, B5, B3', 'min': 200, 'max': 5000, 'gamma': 1.2},
        'B7, B4, B3': lambda params: {'bands': 'B7, B4, B3', 'min': 200, 'max': 5000, 'gamma': 1.2},
        'B7, B5, B3': lambda params: {'bands': 'B7, B5, B3', 'min': 200, 'max': 5000, 'gamma': 1.2},
        'B7, B4, B2': lambda params: {'bands': 'B7, B4, B2', 'min': 200, 'max': 5000, 'gamma': 1.2},
        # 'B4_brdf, B5_brdf, B3_brdf': lambda params: {
        #     'bands': 'B4_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 150, 'gamma': '2.2, 0.9, 1.0'},
        'B4_brdf, B5_brdf, B3_brdf': lambda params: {
            'bands': 'B4_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 255, 'gamma': 1.2},
        # 'B7_brdf, B4_brdf, B3_brdf': lambda params: {
        #     'bands': 'B7_brdf, B4_brdf, B3_brdf', 'min': 0, 'max': 150, 'gamma': '0.9, 2.0, 1.0'},
        'B7_brdf, B4_brdf, B3_brdf': lambda params: {
            'bands': 'B7_brdf, B4_brdf, B3_brdf', 'min': 0, 'max': 255, 'gamma': 1.2},
        'B7_brdf, B5_brdf, B3_brdf': lambda params: {
        #     'bands': 'B7_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 150, 'gamma': '1.5, 1.5, 1.5'},
        # 'B7_brdf, B5_brdf, B3_brdf': lambda params: {
            'bands': 'B7_brdf, B5_brdf, B3_brdf', 'min': 0, 'max': 255, 'gamma': 1.2},
        'temp': lambda params: {'bands': 'temp', 'min': 200, 'max': 400, 'palette': '0000FF, FF0000'},
        'cluster': lambda params: {'bands': 'cluster', 'min': 0, 'max': 5000},
        'date': lambda params: {
            'bands': 'date',
            'min': params['from_days_since_epoch'],
            'max': params['to_days_since_epoch'],
            'palette': '00FFFF, 000099'
        },
        'days': lambda params: {
            'bands': 'days',
            'min': 0,
            'max': 183,
            'palette': '00FF00, FF0000'
        },
    }
    _epoch = datetime.utcfromtimestamp(0)
    _milis_per_day = 1000 * 60 * 60 * 24

    def _viz_params(self):
        return self._viz_by_bands[', '.join(self.bands)]({
            'from_days_since_epoch': self.from_date / self._milis_per_day,
            'to_days_since_epoch': self.to_date / self._milis_per_day
        })


class PreselectedScenesMosaic(Mosaic):
    def __init__(self, aoi, target_day_of_year, target_day_of_year_weight, bands, sceneIds, strategy, fmask_threshold):
        super(PreselectedScenesMosaic, self).__init__(
            aoi=aoi,
            target_day_of_year=target_day_of_year,
            target_day_of_year_weight=target_day_of_year_weight,
            bands=bands, strategy=strategy, fmask_threshold=fmask_threshold)
        self.sceneIds = sceneIds

        def acquisition(scene):
            date = datetime.strptime(scene[9:16], '%Y%j')
            return (date - self._epoch).total_seconds() * 1000

        acquisition_timestamps = [acquisition(scene) for scene in self.sceneIds]
        self.from_date = min(acquisition_timestamps)
        self.to_date = max(acquisition_timestamps)

    @staticmethod
    def create(spec):
        return PreselectedScenesMosaic(
            aoi=Aoi.create(spec['aoi']),
            target_day_of_year=int(spec['targetDayOfYear']),
            target_day_of_year_weight=float(spec['targetDayOfYearWeight']),
            bands=spec['bands'],
            sceneIds=spec['sceneIds'],
            strategy=spec.get('strategy', Mosaic.default_strategy),
            fmask_threshold=int(spec.get('fmaskThreshold', Mosaic.default_fmask_threshold)))

    def _ee_image(self):
        mosaic = landsat.create_mosaic_from_scene_ids(
            aoi=self.aoi.geometry(),
            sceneIds=self.sceneIds,
            from_date=self.from_date,
            to_date=self.to_date,
            target_day_of_year=self.target_day_of_year,
            target_day_of_year_weight=self.target_day_of_year_weight,
            bands=self.bands,
            strategy=self.strategy,
            fmask_threshold=self.fmask_threshold
        )
        return mosaic


class AutomaticSceneSelectingMosaic(Mosaic):
    def __init__(self, aoi, target_day_of_year, target_day_of_year_weight, bands, sensors, from_date, to_date,
                 strategy, fmask_threshold):
        super(AutomaticSceneSelectingMosaic, self).__init__(
            aoi=aoi,
            target_day_of_year=target_day_of_year,
            target_day_of_year_weight=target_day_of_year_weight,
            bands=bands, strategy=strategy, fmask_threshold=fmask_threshold)
        self.sensors = sensors
        self.from_date = from_date
        self.to_date = to_date

    def _ee_image(self):
        mosaic = landsat.create_mosaic(
            aoi=self.aoi.geometry(),
            sensors=self.sensors,
            from_date=self.from_date,
            to_date=self.to_date,
            target_day_of_year=self.target_day_of_year,
            target_day_of_year_weight=self.target_day_of_year_weight,
            bands=self.bands,
            strategy=self.strategy,
            fmask_threshold=self.fmask_threshold
        )
        return mosaic

    @staticmethod
    def create(spec):
        return AutomaticSceneSelectingMosaic(
            aoi=Aoi.create(spec['aoi']),
            target_day_of_year=int(spec['targetDayOfYear']),
            target_day_of_year_weight=float(spec['targetDayOfYearWeight']),
            bands=spec['bands'],
            sensors=spec['sensors'],
            from_date=spec['fromDate'],
            to_date=spec['toDate'],
            strategy=spec.get('strategy', Mosaic.default_strategy),
            fmask_threshold=int(spec.get('fmaskThreshold', Mosaic.default_fmask_threshold)))
