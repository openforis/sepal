// What the SSH keys panel shows and does. The panel and row widgets reach the store and the DOM in ways a
// unit test cannot serve, so they are passthroughs; the activation HOCs are replaced by the props they
// would inject.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/widget/activation/activatable', () => ({withActivatable: () => component => component}))
vi.mock('~/widget/activation/activator', () => ({withActivators: () => component => component}))
vi.mock('~/user', () => ({sshKeys$: vi.fn(), removeSshKey$: vi.fn()}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/listItem', () => ({ListItem: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/message', () => ({
    Message: ({type, children}) => <div className={`message ${type}`}>{children}</div>
}))
vi.mock('~/widget/noData', () => ({NoData: ({message}) => <div className='no-data'>{message}</div>}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: ({title, description, removeMessage, onRemove}) =>
        <div className='key'>
            <div className='title'>{title}</div>
            <div className='description'>{description}</div>
            <button className='remove' title={removeMessage} onClick={onRemove}/>
        </div>
}))
vi.mock('~/widget/panel/panel', () => {
    const Panel = ({children}) => <div>{children}</div>
    Panel.Header = ({title}) => <h1>{title}</h1>
    Panel.Content = ({children}) => <div>{children}</div>
    const Buttons = ({children}) => <div>{children}</div>
    Buttons.Main = ({children}) => <div>{children}</div>
    Buttons.Extra = ({children}) => <div>{children}</div>
    Buttons.Close = ({onClick}) => <button className='close' onClick={onClick}/>
    Buttons.Add = ({onClick, disabled}) => <button className='add' disabled={disabled} onClick={onClick}/>
    Panel.Buttons = Buttons
    return {Panel}
})

import {setLanguage, TranslationProvider} from '~/translate'
import {removeSshKey$, sshKeys$} from '~/user'

import {SshKeys} from './sshKeys'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the SSH keys panel', () => {
    let mounted

    // connect() is mocked away, so the stream prop it would inject subscribes directly.
    const stream = (_name, stream$, onNext, onError) => {
        stream$?.subscribe({next: onNext, error: onError})
        return {active: false}
    }

    const render = ({activatable = {deactivate: vi.fn()}} = {}) => {
        const activator = {activatables: {userDetails: {activate: vi.fn()}, addSshKey: {activate: vi.fn()}}}
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <SshKeys stream={stream} activator={activator} activatable={activatable}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    beforeEach(() => {
        mounted = []
        vi.mocked(removeSshKey$).mockReset()
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('lists each key by name, with its type and fingerprint on separate lines', () => {
        const laptop = aKey({id: 1, name: 'Laptop'})
        const desktop = aKey({id: 2, name: 'Desktop', type: 'ssh-rsa', fingerprint: 'SHA256:desktop'})
        givenKeys([laptop, desktop])

        const container = render()

        const rows = [...container.querySelectorAll('.key')].map(row => ({
            title: row.querySelector('.title').textContent,
            description: [...row.querySelectorAll('.description div')].filter(line => !line.children.length).map(line => line.textContent)
        }))
        expect(rows).toEqual([
            {title: 'Laptop', description: ['ssh-ed25519', laptop.fingerprint]},
            {title: 'Desktop', description: ['ssh-rsa', 'SHA256:desktop']}
        ])
    })

    it('says there are no keys, and what keys are for', () => {
        givenKeys([])

        const container = render()

        expect(container.querySelector('.no-data').textContent).toBe('You have no SSH keys.')
        expect(container.querySelector('.message.info').textContent)
            .toBe('SSH keys allow you to login into a session without having to type your password.')
    })

    // The SSH entry point has its own address and port, which the web address does not tell.
    it('does not guess an SSH login command from the web address', () => {
        givenKeys([])

        const container = render()

        expect(container.textContent).not.toContain(`@${window.location.hostname}`)
    })

    it('removes a key and drops it from the list', () => {
        const laptop = aKey({id: 1, name: 'Laptop'})
        const desktop = aKey({id: 2, name: 'Desktop', fingerprint: 'SHA256:desktop'})
        givenKeys([laptop, desktop])
        vi.mocked(removeSshKey$).mockReturnValue(of(null))
        const container = render()

        act(() => container.querySelector('.remove').click())

        expect(removeSshKey$).toHaveBeenCalledWith(laptop.id)
        expect([...container.querySelectorAll('.key .title')].map(title => title.textContent)).toEqual(['Desktop'])
    })

    it('offers no add once the user has twenty keys', () => {
        givenKeys(Array.from({length: 20}, (_, i) => aKey({id: i + 1, fingerprint: `SHA256:${i}`})))

        const container = render()

        expect(container.querySelector('.add').disabled).toBe(true)
    })

    // Opened from the footer menu, the panel has nothing to go back to.
    it('closes without opening another panel', () => {
        givenKeys([])
        const activatable = {deactivate: vi.fn()}
        const container = render({activatable})

        act(() => container.querySelector('.close').click())

        expect(activatable.deactivate).toHaveBeenCalled()
    })

    it('offers add below twenty keys', () => {
        givenKeys([aKey()])

        const container = render()

        expect(container.querySelector('.add').disabled).toBe(false)
    })
})

const givenKeys = keys => vi.mocked(sshKeys$).mockReturnValue(of(keys))

const aKey = (over = {}) => ({
    id: 1, name: 'Laptop', type: 'ssh-ed25519', fingerprint: 'SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM',
    creationTime: '2026-09-28T10:00:00.000Z', ...over
})
