const _request1 = {files: null}

const _response1 = {files: {
    'file1': {size: 1000, lastModified: 1234},
    'file2': {size: 100, lastModified: 1234},
    'dir1': {files: null}
}}

const _request2 = {files: {
    'dir1': {files: null}
}}

const _response2 = {files: {
    'dir1': {files: {
        'file3': {size: 400, lastModified: 1234},
        'dir2': {files: null}
    }}
}}

const _state = {
    open: true,
    files: {
        'file1': {size: 1000, lastModified: 1234},
        'file2': {size: 100, lastModified: 1234},
        'dir1': {
            open: true,
            files: {
                'file3': {size: 400, lastModified: 1234},
                'dir2': {
                    open: false,
                    files: {
                        'file4': {size: 400, lastModified: 1234},
                        'dir3': {files: null},
                        'file5': {size: 683, lastModified: 1234},
                        'file6': {size: 4003, lastModified: 1234}
                    }
                }
            }
        }
    }
}

// drop: open, size, files

const _refreshRequest = {files: {
    'file1': {lastModified: 1234},
    'file2': {lastModified: 1234},
    'dir1': {files: {
        'file3': {lastModified: 1234},
        'dir2': {files: {
            'file4': {lastModified: 1234},
            'dir3': {files: null},
            'file5': {lastModified: 1234},
            'file6': {lastModified: 1234}
        }}
    }}
}}

// remove file1, add file 7 to the root
const _refreshResponse1 = {files: {
    'file1': {removed: true},
    'file7': {size: 999, lastModified: 1234}
}}

// delete dir1
const _refreshResponse2 = {files: {
    'dir1': {removed: true}
}}

// remove file4, add file 8 to dir1
const _refreshResponse3 = {files: {
    'dir1': {files: {
        'file8': {size: 2999, lastModified: 1234},
        'dir2': {files: {
            'file4': {removed: true}
        }}
    }}
}}

// file3 updated, dir2 renamed
const _refreshResponse4 = {files: {
    'dir1': {files: {
        'file3': {size: 21999, lastModified: 123344},
        'dir2': {removed: true},
        'dir2up': {files: {
            'file4': {size: 400, lastModified: 1234},
            'dir3': {files: null},
            'file5': {size: 683, lastModified: 1234},
            'file6': {size: 4003, lastModified: 1234}
        }}
    }}
}}
