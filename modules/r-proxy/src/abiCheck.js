import {readdir, readFile, rm, writeFile} from 'fs/promises'
import Path from 'path'

import {getLogger} from '#sepal/log'

import {CRAN_ROOT, libPath} from './config.js'
import {runScript} from './script.js'

const log = getLogger('abiCheck')

// libPath and CRAN_ROOT are already scoped to <platformVersion> (see config.js).
const MARKER = Path.join(libPath, '.r-version')

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

// On startup, if R has changed since the last run, find every installed package whose
// compiled .so fails to load under the current R (an ABI mismatch) and remove it from both
// the build library and the served binaries. The existing on-demand build path
// (proxy-cran.js -> enqueueBuildCranPackage) recompiles each on first client request.
//
// Detection is symbol-agnostic: a bare dyn.load resolves against libR.so and the system
// libraries automatically, so a load failure pinpoints true R-ABI breaks without a hardcoded
// symbol list. False positives are possible but rare: a package whose .so directly links
// another R package's C symbols (most use R_RegisterCCallable runtime lookup instead) could
// fail a bare dyn.load even when healthy. Worst case is one extra package rebuild — acceptable.
export const invalidateIncompatiblePackages = async () => {
    const currentR = (await runScript('get_r_version.sh', [])).trim()
    const recordedR = await readFile(MARKER, 'utf8').then(s => s.trim()).catch(() => null)
    if (recordedR === currentR) {
        log.info(`R unchanged [${currentR}] - skipping ABI check`)
        return
    }
    log.info(`R changed [${recordedR} -> ${currentR}] - checking cached packages for ABI compatibility`)
    const broken = (await runScript('find_incompatible_packages.r', [libPath]))
        .split('\n').map(s => s.trim()).filter(Boolean)
    if (broken.length) {
        log.warn(`Removing ${broken.length} ABI-incompatible package(s): ${broken.join(', ')}`)
        for (const pkg of broken) {
            await removePackage(pkg)
        }
    } else {
        log.info('No ABI-incompatible packages found')
    }
    await writeFile(MARKER, currentR)
}
