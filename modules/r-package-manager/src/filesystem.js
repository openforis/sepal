const Path = require('path')
const {readdir, stat} = require('fs/promises')
const log = require('sepal/log').getLogger('filesystem')
const {cranRoot} = require('./config')
const compareVersions = require('compare-versions')
const _ = require('lodash')

const BIN_CONTRIB_DIR = Path.join(cranRoot, 'bin/contrib')
const SRC_CONTRIB_DIR = Path.join(cranRoot, 'src/contrib')

const isChildOf = (parent, dir) => {
    const relative = Path.relative(parent, dir)
    return relative && !relative.startsWith('..') && !Path.isAbsolute(relative)
}

const isCranRepoPath = path =>
    isChildOf(cranRoot, path)

const getRepoPath = path => {
    const repoPath = Path.join(cranRoot, path)
    if (!isCranRepoPath(repoPath)) {
        throw new Error('Illegal path:', path)
    }
    return repoPath
}

const getBinaryPath = path =>
    getRepoPath(path, BIN_CONTRIB_DIR)

const getSourcePath = path =>
    getRepoPath(path, SRC_CONTRIB_DIR)

const getPackageInfo = filename => {
    const VERSION_REGEX = /(.*?)(?:_(.*))?\.tar\.gz/
    const result = filename.match(VERSION_REGEX)
    return result ? {
        filename,
        packageName: result[1],
        version: result[2],
    } : {}
}

const getPackageFileVersion = filename => {
    const packageInfo = getPackageInfo(filename)
    return packageInfo && packageInfo.version
}

const getPackageFilename = (name, version) =>
    `${name}${version ? `_${version}` : ''}.tar.gz`

const getLatestVersion = async (name, dir) => {
    const files = await readdir(dir)
    const prefix = `${name}_`
    const version = _(files)
        .filter(file => file.startsWith(prefix))
        .map(file => getPackageFileVersion(file))
        .sort(compareVersions)
        .last()
    return version
}

const getLatestBinaryVersion = async name =>
    getLatestVersion(name, BIN_CONTRIB_DIR)

const getLatestSourceVersion = async name =>
    getLatestVersion(name, SRC_CONTRIB_DIR)

const getBinaryPackagePath = async (name, version) => {
    if (version) {
        return getBinaryPath(getPackageFilename(name))
    } else {
        const latestVersion = await getLatestBinaryVersion()
        if (latestVersion) {
            return getBinaryPath(getPackageFilename(name, latestVersion))
        }
    }
}

const getSourcePackagePath = async (name, version) => {
    if (version) {
        return getSourcePath(getPackageFilename(name))
    } else {
        const latestVersion = await getLatestSourceVersion()
        if (latestVersion) {
            return getSourcePath(getPackageFilename(name, latestVersion))
        }
    }
}

const isBinaryPackageExisting = async filename => {
    try {
        await stat(getBinaryPath(filename))
        return true
    } catch (error) {
        return false
    }
}

const isSourcePackageExisting = async filename => {
    try {
        await stat(getSourcePath(filename))
        return true
    } catch (error) {
        return false
    }
}

module.exports = {getRepoPath, getPackageFilename, getPackageInfo, getPackageFileVersion, getBinaryPath, getSourcePath, isChildOf, getLatestBinaryVersion, getLatestSourceVersion, getBinaryPackagePath, getSourcePackagePath, isBinaryPackageExisting, isSourcePackageExisting}
