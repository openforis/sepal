import {readdir, readFile, rm, writeFile} from 'node:fs/promises'
import Path from 'node:path'

import {getLogger} from '#sepal/log'

import {CRAN_ROOT, GITHUB_ROOT, libPath} from './config.js'
import {runScript} from './script.js'

const log = getLogger('abiCheck')

// libPath, CRAN_ROOT and GITHUB_ROOT are already scoped to <platformVersion> (see config.js).
const MARKER = Path.join(libPath, '.r-version')

const R_MINOR_VERSION_MATCHER = /^R version (\d+\.\d+)/

const removePackage = async pkg => {
    await rm(Path.join(libPath, pkg), {recursive: true, force: true})
    for (const sub of ['bin/contrib', '.bin/contrib']) {
        const dir = Path.join(CRAN_ROOT, sub)
        const files = await readdir(dir).catch(() => [])
        await Promise.all(
            files
                .filter(f => f.startsWith(`${pkg}_`) && f.endsWith('.tar.gz'))
                .map(f => rm(Path.join(dir, f), {force: true}))
        )
    }
}

const findLines = async (script, args) =>
    (await runScript(script, args))
        .split('\n').map(s => s.trim()).filter(Boolean)

// On startup, if the R minor version has changed since the last run, remove every installed package and
// served binary whose compiled code was built under another minor version: R keeps binary compatibility
// only within a minor version. The existing on-demand build path (proxy-cran.js -> enqueueBuildCranPackage)
// recompiles each CRAN package on first client request.
//
// The served binaries are checked separately from the installed packages: a binary outlives the
// installed copy it was bundled from when that copy is reinstalled or removed.
export const invalidateIncompatiblePackages = async () => {
    const currentR = (await runScript('get_r_version.sh', [])).match(R_MINOR_VERSION_MATCHER)[1]
    const recordedR = await readFile(MARKER, 'utf8').then(s => s.trim()).catch(() => null)
    if (recordedR === currentR) {
        log.info(`R minor version unchanged [${currentR}] - skipping ABI check`)
        return
    }
    log.info(`R minor version changed [${recordedR} -> ${currentR}] - checking cached packages for ABI compatibility`)
    const packages = await findLines('find_incompatible_packages.r', [libPath])
    if (packages.length) {
        log.warn(`Removing ${packages.length} ABI-incompatible package(s): ${packages.join(', ')}`)
        for (const pkg of packages) {
            await removePackage(pkg)
        }
    }
    const binaries = await findLines('find_incompatible_binaries.r', [Path.join(CRAN_ROOT, 'bin'), Path.join(GITHUB_ROOT, 'bin')])
    if (binaries.length) {
        log.warn(`Removing ${binaries.length} ABI-incompatible binary package(s): ${binaries.join(', ')}`)
        await Promise.all(binaries.map(binary => rm(binary, {force: true})))
    }
    if (!packages.length && !binaries.length) {
        log.info('No ABI-incompatible packages found')
    }
    await writeFile(MARKER, currentR)
}
