import {delete$, get$} from 'http-client'
import {map} from 'rxjs/operators'
import {of} from 'rxjs'

const responses = {
    '/': {
        files: {
            'file1': {size: 1000, lastModified: 1234},
            'file2': {size: 100, lastModified: 1234},
            'dir1': {files: null}
        }
    },
    '/dir1': {
        files: {
            'file3': {size: 400, lastModified: 1234},
            'dir2': {files: null}
        }
    },
    '/dir1/dir2': {
        files: {
            'file4': {size: 400, lastModified: 1234},
            'dir3': {files: null},
            'file5': {size: 683, lastModified: 1234},
            'a long file name to test horizontal scrolling a long file name to test horizontal scrolling a long file name to test horizontal scrolling ': {size: 4003, lastModified: 1234}
        }
    },
    '/dir1/dir2/dir3': {
        files: {
            'file6': {size: 400, lastModified: 1234},
            'file7': {size: 683, lastModified: 1234},
            'some other file here': {size: 4003, lastModified: 1234}
        }
    },
    '/dir1/dir4/dir5': {
        files: {
            'file10': {size: 400, lastModified: 1234},
            'another long file name to test horizontal scrolling a long file name to test horizontal scrolling a long file name to test horizontal scrolling ': {size: 4003, lastModified: 1234}
        }
    }
}

const updateResponse = {
    files: {
        'file2': null,
        'dir1': {
            files: {
                'dir2': {
                    files: {
                        'dir3': null,
                        'file8': {size: 12345, lastModified: 34534}
                    }
                },
                'dir4': {
                    files: {
                        'dir5': {files: null}
                    }
                },
                'file9': {size: 100, lastModified: 945885}
            }
        }
    }
}

export default {
    // loadPath$: path => get$('/api/files', {query: {path}}).pipe(toResponse),
    // removePath$: path => delete$(`/api/files/${encodeURIComponent(path)}`).pipe(toResponse)
    loadPath$: request => of(responses[request]),
    removePath$: path => of(path),
    updateTree$: () => of(updateResponse)
}

const toResponse = map(e => e.response)
