import {delay, map} from 'rxjs/operators'
import {delete$, get$} from 'http-client'
import {of} from 'rxjs'

const responses = {
    '/': {
        dir: true,
        count: 4,
        files: {
            'file1': {size: 1000, lastModified: 1234},
            'file2': {size: 100, lastModified: 1234},
            'dir1': {dir: true, count: 2},
            'dir0': {dir: true, count: 0}
        }
    },
    '/dir1': {
        dir: true,
        count: 2,
        files: {
            'file3': {size: 400, lastModified: 1234},
            'dir2': {dir: true, count: 4}
        }
    },
    '/dir1/dir2': {
        dir: true,
        count: 4,
        files: {
            'file4': {size: 400, lastModified: 1234},
            'dir3': {dir: true, count: 3},
            'file5': {size: 683, lastModified: 1234},
            'a long file name to test horizontal scrolling a long file name to test horizontal scrolling a long file name to test horizontal scrolling ': {size: 4003, lastModified: 1234}
        }
    },
    '/dir1/dir2/dir3': {
        dir: true,
        count: 3,
        files: {
            'file6': {size: 400, lastModified: 1234},
            'file7': {size: 683, lastModified: 1234},
            'some other file here': {size: 4003, lastModified: 1234}
        }
    },
    '/dir1/dir4/dir5': {
        dir: true,
        count: 2,
        files: {
            'file10': {size: 400, lastModified: 1234},
            'another long file name to test horizontal scrolling a long file name to test horizontal scrolling a long file name to test horizontal scrolling ': {size: 4003, lastModified: 1234}
        }
    }
}

const updateResponse = {
    dir: true,
    count: 2,
    files: {
        'file2': {removed: true},
        'dir0': {
            dir: true,
            count: 0,
            removed: true
        },
        'dir1': {
            dir: true,
            count: 4,
            files: {
                'file2': {size: 100, lastModified: 1234},
                'dir2': {
                    dir: true,
                    count: 2,
                    files: {
                        'dir3': {removed: true},
                        'file8': {size: 12345, lastModified: 34534}
                    }
                },
                'dir4': {
                    dir: true,
                    count: 11,
                    files: {
                        'dir5': {files: null},
                        'dir3': {
                            dir: true,
                            count: 12,
                            files: {
                                'file6': {size: 400, lastModified: 1234},
                                'file7': {size: 683, lastModified: 1234},
                                'some other file here': {size: 4003, lastModified: 1234},
                                'fileX1': {size: 12345, lastModified: 34534},
                                'fileX2': {size: 12345, lastModified: 34534},
                                'fileX3': {size: 12345, lastModified: 34534},
                                'fileX4': {size: 12345, lastModified: 34534},
                                'fileX5': {size: 12345, lastModified: 34534},
                                'fileX6': {size: 12345, lastModified: 34534},
                                'fileX7': {size: 12345, lastModified: 34534},
                                'fileX8': {size: 12345, lastModified: 34534},
                                'fileX9': {size: 12345, lastModified: 34534},
                            }
                        },
                        'fileX1': {size: 12345, lastModified: 34534},
                        'fileX2': {size: 12345, lastModified: 34534},
                        'fileX3': {size: 12345, lastModified: 34534},
                        'fileX4': {size: 12345, lastModified: 34534},
                        'fileX5': {size: 12345, lastModified: 34534},
                        'fileX6': {size: 12345, lastModified: 34534},
                        'fileX7': {size: 12345, lastModified: 34534},
                        'fileX8': {size: 12345, lastModified: 34534},
                        'fileX9': {size: 12345, lastModified: 34534},
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
    loadPath$: request => of(responses[request]).pipe(delay(500)),
    removePath$: path => of(path).pipe(delay(1000)),
    updateTree$: () => of(updateResponse).pipe(delay(500))
}

const toResponse = map(e => e.response)
