import {delete$, get$} from 'http-client'
import {map} from 'rxjs/operators'
import {of} from 'rxjs'

const firstResponse = {
    files: {
        'file1': {size: 1000, lastModified: 1234},
        'file2': {size: 100, lastModified: 1234},
        'dir1': {
            files: {
                'file3': {size: 400, lastModified: 1234},
                'dir2': {
                    files: {
                        'file4': {size: 400, lastModified: 1234},
                        'dir3': {
                            files: {}
                        },
                        'file5': {size: 683, lastModified: 1234},
                        'a long file name to test hotrizontal scrolling a long file name to test hotrizontal scrolling a long file name to test horizontal scrolling ': {size: 4003, lastModified: 1234}
                    }
                }
            }
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
                        'file6': {size: 12345, lastModified: 34534}
                    }
                }
            }
        }
    }
}

export default {
    // loadFiles$: path => get$('/api/files', {query: {path}}).pipe(toResponse),
    loadFiles$: request => of(request ? updateResponse : firstResponse),

    removeItem$: path => delete$(`/api/files/${encodeURIComponent(path)}`).pipe(toResponse)
}

const toResponse = map(e => e.response)
