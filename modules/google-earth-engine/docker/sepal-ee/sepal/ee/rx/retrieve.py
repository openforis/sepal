import uuid

import ee
from rx import concat, of
from rx.operators import flat_map
from sepal.drive.rx.path import create_folder_with_path, delete_file_with_path, download_path
from sepal.ee.rx.export import export_image_to_drive
from sepal.ee.rx.image import get_band_names
from sepal.gdal.rx import build_vrt, set_band_names


def image_to_sepal(credentials, image, description, download_dir, band_names=None):
    drive_folder_path = '_'.join(['Sepal', description, str(uuid.uuid4())])
    destination_path = download_dir + '/' + description

    def _create_drive_folder():
        return create_folder_with_path(credentials, drive_folder_path)

    def _export_to_drive():
        return export_image_to_drive(
            credentials,
            image,
            description=description,
            folder=drive_folder_path
        )

    def _download_from_drive():
        return download_path(
            credentials,
            path=drive_folder_path,
            destination=destination_path,
            delete_after_download=True
        )

    def _delete_drive_folder():
        return delete_file_with_path(
            credentials,
            path=drive_folder_path
        )

    def _build_vrt():
        return build_vrt(
            destination=destination_path + '/' + description + '.vrt',
            files=destination_path + '/*.tif'
        )

    def _set_band_names():
        band_names_stream = of(band_names) if band_names else get_band_names(credentials, image)
        return band_names_stream.pipe(
            flat_map(
                lambda names: set_band_names(
                    band_names=names,
                    files=[destination_path + '/*.tif', destination_path + '/*.vrt']
                )
            )
        )

    ee.InitializeThread(credentials)
    return concat(
        _create_drive_folder(),
        _export_to_drive(),
        _download_from_drive(),
        _delete_drive_folder(),
        _build_vrt(),
        _set_band_names()
    )
