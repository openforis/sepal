import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Choosing a public key file for the add-key form, through the real drop zone. Files arrive through its
// hidden file input, the way both a drop and the file dialog hand them over.

vi.mock('~/translate', () => ({msg: key => key}))

const {SshKeyFileSelect} = await import('./sshKeyFileSelect')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('choosing an SSH public key file', () => {
    it('hands over the key in a .pub file', async () => {
        const {onLoad, onError} = render()

        await choose({onLoad, onError}, aFile('id_ed25519.pub', `${PUBLIC_KEY}\n`))

        expect(onLoad).toHaveBeenCalledWith(PUBLIC_KEY)
        expect(onError).not.toHaveBeenCalled()
    })

    // The file next to a .pub file is the private key.
    it('refuses a file that is not a .pub file', async () => {
        const {onLoad, onError} = render()

        await choose({onLoad, onError}, aFile('id_ed25519', PRIVATE_KEY))

        expect(onLoad).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith('user.sshKeys.add.form.file.notPub')
    })

    it('refuses a .pub file too large to be a public key', async () => {
        const {onLoad, onError} = render()

        await choose({onLoad, onError}, aFile('huge.pub', 'x'.repeat(64 * 1024)))

        expect(onLoad).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith('user.sshKeys.add.form.file.tooLarge')
    })

    it('offers only .pub files in the file dialog', () => {
        render()

        expect(fileInput().accept.split(',')).toContain('.pub')
        expect(fileInput().accept.split(',')).not.toContain('*')
    })
})

const PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl alice@laptop'
const PRIVATE_KEY = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n'

let root
let container

beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
})

const render = () => {
    const onLoad = vi.fn()
    const onError = vi.fn()
    act(() => root.render(<SshKeyFileSelect onLoad={onLoad} onError={onError}/>))
    return {onLoad, onError}
}

const fileInput = () => container.querySelector('input[type=file]')

// Reading a file is asynchronous: wait until the select has answered one way or the other.
const choose = async ({onLoad, onError}, file) => {
    const input = fileInput()
    Object.defineProperty(input, 'files', {value: [file], configurable: true})
    await act(async () => {
        input.dispatchEvent(new window.Event('change', {bubbles: true}))
        await vi.waitFor(() => expect(onLoad.mock.calls.length + onError.mock.calls.length).toBe(1))
    })
}

const aFile = (name, content) => new window.File([content], name, {type: ''})
