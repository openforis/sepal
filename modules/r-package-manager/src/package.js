const Path = require('path')
const {createReadStream} = require('fs')
const {stat, realpath} = require('fs/promises')
const log = require('sepal/log').getLogger('package')
const {downloadPackage, installPackage, checkVersion, makeBinaryPackage} = require('./R')
const {cranRoot} = require('./config')
const {getMostRecentBinaryVersion, getMostRecentSourceVersion, getBinaryPath, getSourcePath, getPackageFilename, getPACKAGESPath, getPackageFileVersion, getBinaryPackagePath, getSourcePackagePath, getLatestBinaryVersion, getLatestSourceVersion, getPackageInfo, isBinaryPackageExisting, isSourcePackageExisting} = require('./filesystem')

// const resolvePath = async (baseDir, path) => {
//     if (!baseDir || baseDir.length < 1) {
//         log.warn(() => 'Base dir missing')
//         return
//     }
//     if (!path || path.length < 1) {
//         log.warn(() => 'Path missing')
//         return
//     }
//     try {
//         const realBaseDir = await realpath(baseDir)
//         const absolutePath = Path.join(realBaseDir, path)
//         try {
//             const realAbsolutePath = await realpath(absolutePath)
//             const relativePath = Path.relative(realBaseDir, realAbsolutePath)
//             const isSubPath = !!relativePath && !relativePath.startsWith('..')
//             if (isSubPath) {
//                 return realAbsolutePath
//             } else {
//                 log.warn(() => `Path not internal to base dir: ${absolutePath}`)
//                 return
//             }
//         } catch (error) {
//             log.warn(() => `Path not found: ${absolutePath}`)
//             return
//         }
//     } catch (error) {
//         log.warn(() => `Base dir not found: ${baseDir}`)
//         return
//     }
// }

const servePackage = async (ctx, path, filename) => {
    if (path) {
        try {
            const stats = await stat(path)
            if (stats.isFile()) {
                log.debug(() => `Serving file ${path}`)
                ctx.body = createReadStream(path)
                ctx.set('Content-Type', 'application/x-gzip')
                ctx.response.status = 200
                ctx.attachment(filename)
            } else {
                log.warn(() => `Not a file: ${path}`)
                ctx.response.status = 404
            }
        } catch (error) {
            // log.warn(() => `Cannot stat path: ${absolutePath}`)
            log.warn(() => error)
            ctx.response.status = 404
        }
    } else {
        ctx.response.status = 404
    }
}

const servePACKAGES = async (ctx, filename) =>
    await servePackage(ctx, getSourcePath(filename), filename)

const serveBinaryPackage = async (ctx, filename) => {
    log.debug(`Serving binary package ${filename}`)
    return await servePackage(ctx, getBinaryPath(filename), filename)
}

const serveSourcePackage = async (ctx, filename) => {
    log.debug(`Serving source package ${filename}`)
    return await servePackage(ctx, getSourcePath(filename), filename)
}

// const secure = https.createServer(config.children.https.options, handler).listen(config.children.https.port, function() {
//     log.info('Listening on port %d', secure.address().port)
// })

// const getPackage = async ctx => {
//     // const path = ctx.request.url
//     // const absolutePath = await resolvePath(cranRoot, path)
//     const name = ctx.params.name

//     if (['PACKAGES.rds', 'PACKAGES.gz', 'PACKAGES'].includes(name)) {
//         log.debug(`Serving ${name}`)
//         await servePACKAGES(ctx, name)
//     } else {
//         const {filename, packageName, version} = getPackageInfo(name)
//         if (version) {
//             if (await isBinaryPackageExisting(filename)) {
//                 return await serveBinaryPackage(ctx, filename)
//             } else {
//                 if (!await isSourcePackageExisting(filename)) {
//                     await downloadPackage(packageName, version)
//                 }
//                 await serveSourcePackage(ctx, filename)
//                 // await

//                 // if (await isSourcePackageExisting(filename)) {
//                 //     await serveSourcePackage(ctx, filename)
//                 //     log.debug('Build binary package here')
//                 //     // await buildBinaryPackage(packageInfo)
//                 //     return
//                 // } else {
//                 //     log.debug('Download source package here')
//                 //     await downloadPackage(packageName, version)
//                 //     await serveSourcePackage(ctx, filename)
//                 //     // console.log(download)
//                 // }
//             }
//         } else {
//             log.debug(`No version provided for ${name}`)
//             // const download = await downloadPackage(packageInfo.packageName)
//             // const mostRecentBinaryVersion = await getLatestBinaryVersion(packageInfo.packageName)
//             // const mostRecentSourceVersion = await getLatestSourceVersion(packageInfo.packageName)
//             // if (mostRecentBinaryVersion && mostRecentBinaryVersion === mostRecentSourceVersion) {
//             //     // most recent version is already available as a binary package
//             //     const filename = getPackageFilename(name, mostRecentBinaryVersion)
//             //     await serveBinaryPackage(ctx, filename)
//             // } else if (mostRecentSourceVersion) {
//             //     const filename = getPackageFilename(name, mostRecentSourceVersion)
//             //     await serveSourcePackage(ctx, filename)
        
//             //     if (download) {
//             //         const {path, version} = download
//             //         const oldVersion = await checkVersion(name, version)
//             //         if (oldVersion) {
//             //             await installPackage(path)
//             //         } else {
//             //             log.debug('Current version already installed')
//             //         }
            
//             //         console.log(await makeBinaryPackage(name, version))
//             //     }
        
//             // } else {
//             //     log.debug(`No package ${name}`)
//             //     ctx.response.status = 404
//             // }
//         }

//         // const binaryPackagePath = await getBinaryPackagePath(name, version)
//         // const sourcePackagePath = await getSourcePackagePath(name, version)

//         // console.log({binaryPackagePath, sourcePackagePath})

//         // const download = await downloadPackage(name)

//         // const mostRecentBinaryVersion = await getLatestBinaryVersion(name)
//         // const mostRecentSourceVersion = await getLatestSourceVersion(name)
    
//         // if (mostRecentBinaryVersion && mostRecentBinaryVersion === mostRecentSourceVersion) {
//         //     // most recent version is already available as a binary package
//         //     const filename = getPackageFilename(name, mostRecentBinaryVersion)
//         //     log.debug(`Serving binary package ${filename}`)
//         //     await serveBinaryPackage(ctx, filename)
//         // } else if (mostRecentSourceVersion) {
//         //     const filename = getPackageFilename(name, mostRecentSourceVersion)
//         //     log.debug(`Serving source package ${filename}`)
//         //     await serveSourcePackage(ctx, filename)
    
//         //     if (download) {
//         //         const {path, version} = download
//         //         const oldVersion = await checkVersion(name, version)
//         //         if (oldVersion) {
//         //             await installPackage(path)
//         //         } else {
//         //             log.debug('Current version already installed')
//         //         }
        
//         //         console.log(await makeBinaryPackage(name, version))
//         //     }
    
//         // } else {
//         //     log.debug(`No package ${name}`)
//         //     ctx.response.status = 404
//         // }
//     }

//     // if (absolutePath) {
//     //     try {
//     //         const stats = await stat(absolutePath)
//     //         if (stats.isFile()) {
//     //             log.debug(() => `Downloading: ${absolutePath}`)

//     //             ctx.body = createReadStream(absolutePath)
//     //             // ctx.attachment(filename)
//     //         } else {
//     //             log.warn(() => `Not a file: ${absolutePath}`)
//     //             ctx.response.status = 404
//     //         }
//     //     } catch (error) {
//     //         // log.warn(() => `Cannot stat path: ${absolutePath}`)
//     //         log.warn(() => error)
//     //         ctx.response.status = 404
//     //     }
//     // } else {
//     //     ctx.response.status = 404
//     // }
// }

module.exports = {getPackage}
