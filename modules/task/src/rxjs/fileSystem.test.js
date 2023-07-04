const {firstValueFrom, from, switchMap, tap} = require('rxjs')
const fs = require('fs')
const os = require('os')
const Path = require('path')
const {ls$, mkdir$, mkdirSafe$} = require('./fileSystem')
const {stream, emitsOne, emitsNothing, throwsError} = require('#sepal/test/rxjs')

let emptyDirPath

describe('ls$()', () => {
    stream('emits an empty list when dir is empty',
        () => ls$(emptyDirPath),
        emitsOne(files => expect(files.length).toBe(0))
    )

    const basename = 'some_dir'
    stream('emits basenames when dir is non-empty',
        () => mkdir$(Path.join(emptyDirPath, basename)).pipe(
            switchMap(() => ls$(emptyDirPath))
        ),
        emitsOne(files => {
            expect(files).toEqual([basename])
        })
    )

    stream('fails when dir does not exist',
        () => ls$(`${emptyDirPath}-non-existing`),
        emitsNothing(),
        throwsError()
    )
})

describe('mkdir$()', () => {
    const path = () => Path.join(emptyDirPath, 'some_dir')

    stream('emits path of dir when successfully created',
        () => mkdir$(path()),
        emitsOne(dirPath => expect(dirPath).toEqual(path()))
    )

    stream('throws error when directory already exists',
        () => mkdir$(path()).pipe(
            switchMap(() => mkdir$(path())) // Should fail - it already exists
        ),
        emitsNothing(),
        throwsError()
    )
})

describe('mkdirSafe$()', () => {
    const preferredPath = () => Path.join(emptyDirPath, 'some_dir')

    stream('emits preferred path when path not already exists',
        () => mkdirSafe$(preferredPath()),
        emitsOne(dirPath => expect(dirPath).toEqual(preferredPath()))
    )

    stream('emits preferredPath_1 when directory already exists and preferredPath ends with /',
        () => mkdir$(preferredPath()).pipe(
            switchMap(() => mkdirSafe$(`${preferredPath()}/`)) // Should fail - it already exists
        ),
        emitsOne(dirPath => expect(Path.basename(dirPath)).toEqual('some_dir_1'))
    )

    stream('emits preferredPath_1 when directory already exists',
        () => mkdir$(preferredPath()).pipe(
            switchMap(() => mkdirSafe$(preferredPath())) // Should fail - it already exists
        ),
        emitsOne(dirPath => expect(Path.basename(dirPath)).toEqual('some_dir_1'))
    )

    stream('emits preferredPath_2 when directory and _1 already exists',
        () => mkdir$(preferredPath()).pipe(
            switchMap(() => mkdir$(Path.join(emptyDirPath, 'some_dir_1'))), // _1 is taken
            switchMap(() => mkdirSafe$(preferredPath())) // Should fail - it already exists
        ),
        emitsOne(dirPath => expect(Path.basename(dirPath)).toEqual('some_dir_2'))
    )
})

const mkTmpDir$ = () =>
    from(fs.promises.mkdtemp(Path.join(os.tmpdir(), 'test-')))

beforeEach(() =>
    firstValueFrom(
        mkTmpDir$().pipe(
            tap(path => emptyDirPath = path)
        )
    )
)

afterEach(() => {
})
