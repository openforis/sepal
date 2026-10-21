import importlib.util
import os
import shutil
import struct
import tempfile
import unittest
from pathlib import Path

from osgeo import gdal, osr


spec = importlib.util.spec_from_file_location(
    'stack_time_series', Path(__file__).with_name('stack_time_series.py')
)
stacker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stacker)


class StackTimeSeriesTest(unittest.TestCase):
    def setUp(self):
        self.original_directory = os.getcwd()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.chdir, self.original_directory)
        self.directory = Path(self.temp.name)

    def test_stacks_drive_chips_without_mixing_their_pixels(self):
        self.write_chunks(separators=('-', '-'))

        stacker.stack_time_series(str(self.directory))

        self.assert_chipped_stack()

    def test_stacks_cloud_storage_chips_without_mixing_their_pixels(self):
        self.write_chunks(separators=('', ''))

        stacker.stack_time_series(str(self.directory))

        self.assert_chipped_stack()

    def test_stacks_chunks_using_different_filename_formats(self):
        self.write_chunks(separators=('-', ''))

        stacker.stack_time_series(str(self.directory))

        self.assert_chipped_stack()

    def test_stacks_unsplit_exports(self):
        self.write_chunks(separators=(None, None))

        stacker.stack_time_series(str(self.directory))

        self.assert_stack(
            width=2, height=2,
            pixels=[(11,) * 4, (12,) * 4, (111,) * 4, (112,) * 4],
            tile_count=1
        )

    def test_refuses_chunks_split_into_different_tiles(self):
        self.write_chunks(separators=('-', None))

        with self.assertRaisesRegex(ValueError, r'chunk-.* has no file for tile \d{10}-\d{10}'):
            stacker.stack_time_series(str(self.directory))

    def test_writes_a_sits_file_per_chip_and_date_that_still_reads_its_pixels_once_moved(self):
        self.write_chunks(separators=('-', '-'))
        sits_dir = self.directory / 'sits'

        stacker.stack_time_series(str(self.directory), 'ndvi', str(sits_dir))

        moved = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, moved)
        shutil.move(self.directory, moved / 'export')
        self.directory.mkdir()
        moved_sits_dir = moved / 'export' / 'sits'
        self.assertEqual(len(list(moved_sits_dir.glob('SEPAL_*_NDVI_*.vrt'))), 16)
        self.assert_pixels(moved_sits_dir / 'SEPAL_0000000000-0000000000_NDVI_2026-07-01.vrt', '2026-07-01', 11)
        self.assert_pixels(moved_sits_dir / 'SEPAL_0000000512-0000000512_NDVI_2026-10-10.vrt', '2026-10-10', 142)

    def assert_pixels(self, path, date, value):
        dataset = gdal.Open(str(path))
        self.assertIsNotNone(dataset)
        self.assertEqual(dataset.RasterCount, 1)
        band = dataset.GetRasterBand(1)
        self.assertEqual(band.GetDescription(), date)
        self.assertEqual(struct.unpack('=4H', band.ReadRaster()), (value,) * 4)

    def assert_chipped_stack(self):
        self.assert_stack(
            width=4, height=4,
            pixels=[
                (11, 11, 21, 21, 11, 11, 21, 21, 31, 31, 41, 41, 31, 31, 41, 41),
                (12, 12, 22, 22, 12, 12, 22, 22, 32, 32, 42, 42, 32, 32, 42, 42),
                (111, 111, 121, 121, 111, 111, 121, 121, 131, 131, 141, 141, 131, 131, 141, 141),
                (112, 112, 122, 122, 112, 112, 122, 122, 132, 132, 142, 142, 132, 132, 142, 142)
            ],
            tile_count=4
        )

    def assert_stack(self, width, height, pixels, tile_count):
        dates = ['2026-07-01', '2026-08-01', '2026-10-01', '2026-10-10']
        self.assertEqual((self.directory / 'dates.csv').read_text().splitlines(), dates)
        self.assertEqual(len(list(self.directory.glob('tile-*/stack.vrt'))), tile_count)
        dataset = gdal.Open(str(self.directory / 'stack.vrt'))
        self.assertIsNotNone(dataset)
        self.assertEqual((dataset.RasterXSize, dataset.RasterYSize), (width, height))
        self.assertEqual(dataset.RasterCount, 4)
        for index, (date, expected) in enumerate(zip(dates, pixels), start=1):
            band = dataset.GetRasterBand(index)
            self.assertEqual(band.GetDescription(), date)
            actual = struct.unpack('=' + 'H' * width * height, band.ReadRaster())
            self.assertEqual(actual, expected)

    def write_chunks(self, separators):
        chunks = [
            ('2026-07-01_2026-10-01', ['2026-07-01', '2026-08-01']),
            ('2026-10-01_2026-10-20', ['2026-10-01', '2026-10-10'])
        ]
        projection = osr.SpatialReference()
        projection.ImportFromEPSG(4326)
        for chunk_index, ((chunk_name, dates), separator) in enumerate(zip(chunks, separators)):
            chunk_dir = self.directory / ('chunk-' + chunk_name)
            chunk_dir.mkdir()
            chips = [(0, 0)] if separator is None else [(0, 0), (0, 512), (512, 0), (512, 512)]
            for chip_index, (row, column) in enumerate(chips):
                suffix = '' if separator is None else f'{separator}{row:010d}-{column:010d}'
                path = chunk_dir / f'TIME_SERIES_EXPORT_0_{chunk_name}{suffix}.tif'
                dataset = gdal.GetDriverByName('GTiff').Create(str(path), 2, 2, 2, gdal.GDT_UInt16)
                dataset.SetProjection(projection.ExportToWkt())
                dataset.SetGeoTransform((column // 256, 1, 0, 4 - row // 256, 0, -1))
                for band_index, date in enumerate(dates, start=1):
                    band = dataset.GetRasterBand(band_index)
                    band.SetDescription(date)
                    value = chunk_index * 100 + (chip_index + 1) * 10 + band_index
                    band.WriteRaster(0, 0, 2, 2, struct.pack('=4H', *([value] * 4)))
                dataset = None


if __name__ == '__main__':
    unittest.main()
