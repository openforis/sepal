from rx import from_list, Observable, of, throw
from rx.operators import flat_map, filter, first, map, reduce

from .download import download_directory
from .list import list_folder


def file_by_path(path: str) -> Observable:
    root_stream = of({'id': 'root', 'path': '/'})

    def find_with_parent(parent_stream, name):
        return parent_stream.pipe(
            flat_map(lambda parent: list_folder(parent, name_filter=name)),
            map(lambda files: files[0] if len(files) else None),
            flat_map(lambda file: of(file) if file else throw(Exception('File {} does not exist.'.format(path))))
        )

    return from_list(path.split('/')).pipe(
        filter(lambda name: name and name.strip()),  # Allows double // and training /
        reduce(find_with_parent, root_stream),
        flat_map(
            lambda file_stream: file_stream.pipe(
                map(lambda file: file)
            )
        ),
        first()
    )


def download_path(
        path: str,
        destination: str,
        matching: str = None,
        delete_after_download: bool = False
) -> Observable:
    return file_by_path(path).pipe(
        flat_map(
            lambda file: download_directory(
                file=file,
                destination=destination,
                matching=matching,
                delete_after_download=delete_after_download
            )
        )
    )
