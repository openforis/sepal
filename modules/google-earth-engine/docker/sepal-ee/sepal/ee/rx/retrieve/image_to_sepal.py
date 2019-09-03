import uuid
from typing import Union

import ee
from rx import concat, empty, of
from rx.operators import flat_map
from sepal.drive.rx.path import create_folder_with_path, delete_file_with_path, download_path
from sepal.ee.rx.export import export_image_to_drive
from sepal.ee.rx.image import get_band_names
from sepal.gdal.rx import build_vrt, set_band_names
from sepal.rx.operators import merge_finalize
from sepal.task.rx.observables import progress


def image_to_sepal(
        credentials,
        description: str,
        download_dir: str,
        image: ee.Image,
        band_names: list = None,
        dimensions=None,
        region: ee.Geometry = None,
        scale: int = None,
        crs: str = None,
        crs_transform: str = None,
        max_pixels: Union[int, float] = None,
        shard_size: int = None,
        file_dimensions=None,
        skip_empty_tiles=None,
        file_format: str = None,
        format_options: str = None,
        retries: int = 0
):
    drive_folder_path = '_'.join(['Sepal', description, str(uuid.uuid4())])
    destination_path = download_dir + '/' + description

    def _create_drive_folder():
        return concat(
            progress(
                default_message='Creating Google Drive download folder...',
                message_key='tasks.retrieve.image_to_sepal.creating_drive_folder'
            ),
            create_folder_with_path(credentials, drive_folder_path).pipe(
                flat_map(lambda _: empty())
            )
        )

    def _export_to_drive():
        return export_image_to_drive(
            credentials,
            image,
            description=description,
            folder=drive_folder_path,
            dimensions=dimensions,
            region=region,
            scale=scale,
            crs=crs,
            crs_transform=crs_transform,
            max_pixels=max_pixels,
            shard_size=shard_size,
            file_dimensions=file_dimensions,
            skip_empty_tiles=skip_empty_tiles,
            file_format=file_format,
            format_options=format_options,
            retries=retries,
        )

    def _download_from_drive():
        return download_path(
            credentials,
            path=drive_folder_path,
            destination=destination_path,
            delete_after_download=True
        )

    def _delete_drive_folder():
        return concat(
            progress(
                default_message='Deleting Google Drive download folder...',
                message_key='tasks.retrieve.image_to_sepal.deleting_drive_folder'
            ),
            delete_file_with_path(
                credentials,
                path=drive_folder_path
            ).pipe(
                flat_map(lambda _: empty())
            )
        )

    def _build_vrt():
        return concat(
            progress(
                default_message='Building VRT...',
                message_key='tasks.retrieve.image_to_sepal.building_vrt'
            ),
            build_vrt(
                destination=destination_path + '/' + description + '.vrt',
                files=destination_path + '/*.tif'
            ).pipe(
                flat_map(lambda _: empty())
            )
        )

    def _set_band_names():
        band_names_stream = of(band_names) if band_names else get_band_names(credentials, image)
        return concat(
            progress(
                default_message='Setting band names...',
                message_key='tasks.retrieve.image_to_sepal.setting_band_names'
            ),
            band_names_stream.pipe(
                flat_map(
                    lambda names: set_band_names(
                        band_names=names,
                        files=[destination_path + '/*.tif', destination_path + '/*.vrt']
                    )
                ),
                flat_map(lambda _: empty())
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
    ).pipe(
        merge_finalize(_delete_drive_folder)
    )
