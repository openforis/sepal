import {ClientException, NotFoundException} from '#sepal/exception'

const ROOT = 'data'
const DOWNLOAD_URL_SECONDS = 15 * 60

// The Data folder as the GUI file browser sees it: a `data` folder at the root of the user's workspace.
export class DataBrowser {
    #attachments
    #providers
    #usage

    constructor({attachments, providers, usage}) {
        this.#attachments = attachments
        this.#providers = providers
        this.#usage = usage
    }

    async list(username, guiPath) {
        const relPath = toRelPath(guiPath)
        const {attachment, provider} = this.#data(username)
        const entries = await provider.list(attachment, relPath)
        return Object.fromEntries(entries
            .filter(({name}) => !isUnsafe(name))
            .map(({name, ...info}) => [name, info]))
    }

    async remove(username, guiPaths) {
        const relPaths = guiPaths.map(toRelPath)
        if (relPaths.includes('')) {
            throw new ClientException('The Data folder cannot be removed')
        }
        const {attachment, provider} = this.#data(username)
        try {
            for (const relPath of relPaths) {
                await provider.remove(attachment, relPath)
            }
        } finally {
            this.#usage.measureSoon(username)
            await this.#usage.markDirty(username)
        }
    }

    async download(username, guiPath) {
        const relPath = toRelPath(guiPath)
        if (relPath === '') {
            throw new ClientException('The Data folder cannot be downloaded')
        }
        const {attachment, provider} = this.#data(username)
        if (provider.isEmulator()) {
            return {...await this.#open(provider, attachment, relPath), filename: relPath.split('/').pop()}
        }
        return {redirect: await provider.downloadUrl(attachment, relPath, {expiresSeconds: DOWNLOAD_URL_SECONDS})}
    }

    async #open(provider, attachment, relPath) {
        try {
            return await provider.download(attachment, relPath)
        } catch (error) {
            if (error.name === 'NoSuchKey') {
                throw new NotFoundException(`No file ${relPath}`)
            }
            throw error
        }
    }

    #data(username) {
        const attachment = this.#attachments.get(username, 'data')
        return {attachment, provider: this.#providers.for(attachment)}
    }
}

const toRelPath = guiPath => {
    const segments = String(guiPath ?? '').split('/')
    const [root, ...rest] = segments
    if (root !== ROOT || rest.some(isUnsafe)) {
        throw new ClientException(`Invalid path: ${guiPath}`)
    }
    return rest.join('/')
}

const isUnsafe = segment =>
    segment === '' || segment.includes('\\') || segment.includes('\0') || isDotSegment(segment) || isDotSegment(decode(segment))

const isDotSegment = segment => segment === '.' || segment === '..'

const decode = segment => {
    try {
        return decodeURIComponent(segment)
    } catch (_error) {
        return '..'
    }
}
