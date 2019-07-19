import uuid

import ee
from rx import concat, empty, of
from rx.operators import flat_map
from sepal.drive.rx.path import create_folder_with_path, delete_file_with_path, download_path
from sepal.ee.rx.export import export_image_to_drive
from sepal.ee.rx.image import get_band_names
from sepal.gdal.rx import build_vrt, set_band_names
from sepal.task.rx.operators import progress
from sepal.format import format_bytes


def image_to_sepal(credentials, image, description, download_dir, band_names=None):
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
        def export_progress(state):
            if state == 'PENDING':
                return progress(
                    default_message='Submitting export task to Google Earth Engine...',
                    message_key='tasks.retrieve.image_to_sepal.gee_task_pending'
                )
            elif state == 'READY':
                return progress(
                    default_message='Waiting for Google Earth Engine to start export...',
                    message_key='tasks.retrieve.image_to_sepal.gee_task_ready'
                )
            elif state == 'RUNNING':
                return progress(
                    default_message='Google Earth Engine is exporting image...',
                    message_key='tasks.retrieve.image_to_sepal.gee_task_running'
                )
            else:
                return empty()

        return export_image_to_drive(
            credentials,
            image,
            description=description,
            folder=drive_folder_path
        ).pipe(
            flat_map(export_progress)
        )

    def _download_from_drive():
        return download_path(
            credentials,
            path=drive_folder_path,
            destination=destination_path,
            delete_after_download=True
        ).pipe(
            flat_map(lambda status: progress(
                default_message='Downloaded {downloaded_files} of {total_files} files ({downloaded} of {total})',
                message_key='tasks.retrieve.image_to_sepal.download_progress',
                downloaded_files=status['downloaded_files'],
                downloaded=format_bytes(status['downloaded_bytes']),
                total_files=status['total_files'],
                total=format_bytes(status['total_bytes'])
            ))
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
        _delete_drive_folder(),  # TODO: Make sure folder is deleted on error too
        _build_vrt(),
        _set_band_names()
    )
