from rx import concat, empty, from_list, of, Observable
from rx.operators import expand, flat_map, map, reduce
from sepal.drive import get_service, is_folder

from .observables import execute

PAGE_SIZE = 1000


def list_folder(
        credentials,
        folder: dict,
        name_filter: str = None,
        retries: int = 5
) -> Observable:
    def next_page(acc):
        def load_page():
            if name_filter:
                q = "'{0}' in parents and name = '{1}'".format(folder['id'], name_filter)
            else:
                q = "'{0}' in parents".format(folder['id'])
            request = get_service(credentials).files().list(
                q=q,
                fields="nextPageToken, files(id, name, size, mimeType, modifiedTime)",
                pageSize=PAGE_SIZE,
                pageToken=acc.get('nextPageToken')
            )
            return request.execute()

        return execute(
            credentials,
            load_page,
            retries=retries,
            description='loading file page {}, {}'.format(folder, acc)
        ).pipe(
            map(lambda page: {
                'files': acc['files'] + page.get('files', []),
                'nextPageToken': page.get('nextPageToken')
            })
        )

    def extract_files(result):
        files = result.get('files', [])
        for file in files:
            file['path'] = '{}{}{}'.format(
                folder['path'],
                file['name'].replace('/', '_'),
                '/' if is_folder(file) else ''
            )
        return files

    return next_page({'files': [], 'nextPageToken': None}).pipe(
        expand(lambda acc: next_page(acc) if acc.get('nextPageToken') else empty()),
        map(extract_files)
    )


def list_folder_recursively(
        credentials,
        folder: dict,
        retries: int = 5
) -> Observable:
    def recurse(file):
        if is_folder(file):
            return concat(
                of([file]),
                list_folder_recursively(credentials, file, retries),
            )
        else:
            return of([file])

    return list_folder(credentials, folder, retries=retries).pipe(
        flat_map(lambda files: from_list(files)),
        flat_map(recurse),
        reduce(lambda acc, files: acc + files, []),
    )
