// The user menu in the footer. ButtonSelect is a passthrough that shows what its button would carry and
// lists its options as buttons; the activation HOC is replaced by the activator prop it would inject.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/user', () => ({logout$: vi.fn()}))
vi.mock('~/widget/activation/activator', () => ({withActivators: () => component => component}))
vi.mock('~/widget/buttonSelect', () => ({
    ButtonSelect: ({label, icon, iconType, hint, options}) =>
        <div className='select' data-icon={icon} data-icon-type={iconType} data-hint={String(hint)}>
            <div className='label'>{label}</div>
            {options.map(({key, value, group, label, icon, iconType, disabled, onSelect}) =>
                group
                    ? <hr key={key} className='option separator'/>
                    : <button key={value} className='option' data-icon={icon} data-icon-type={iconType} disabled={disabled}
                        onClick={() => onSelect()}>{label}</button>
            )}
        </div>
}))

import {of} from 'rxjs'

import {setLanguage, TranslationProvider} from '~/translate'
import {logout$} from '~/user'

import {UserMenuButton} from './userMenu'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the user menu', () => {
    let mounted

    const render = ({activatables = allActivatable(), googleAccount = false, hint = false} = {}) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <UserMenuButton username='alice' googleAccount={googleAccount} hint={hint} activator={{activatables}} stream={stream}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    beforeEach(() => mounted = [])
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('is labelled with the username and offers user details, password, Google account and SSH keys, then logout', () => {
        const container = render()

        expect(container.querySelector('.label').textContent).toBe('alice')
        expect(optionLabels(container)).toEqual(['User details', 'Password', 'Google account', 'SSH keys', '—', 'Logout'])
    })

    it('logs the user out from its last entry', () => {
        vi.mocked(logout$).mockReturnValue(of(null))
        const container = render()

        act(() => option(container, 'Logout').click())

        expect(logout$).toHaveBeenCalled()
    })

    it('gives each entry the icon of its panel', () => {
        const container = render()

        const icons = [...container.querySelectorAll('.option')]
            .map((option, i) => [optionLabels(container)[i], option.dataset.icon, option.dataset.iconType])
        expect(icons).toEqual([
            ['User details', 'user', undefined],
            ['Password', 'key', undefined],
            ['Google account', 'google', 'brands'],
            ['SSH keys', 'terminal', undefined],
            ['—', undefined, undefined],
            ['Logout', 'sign-out-alt', undefined]
        ])
    })

    it('opens the panel of the selected entry, and only that one', () => {
        const activatables = allActivatable()
        const container = render({activatables})

        act(() => option(container, 'SSH keys').click())

        expect(activatables.sshKeys.activate).toHaveBeenCalled()
        expect(activatables.userDetails.activate).not.toHaveBeenCalled()
        expect(activatables.changePassword.activate).not.toHaveBeenCalled()
        expect(activatables.googleAccount.activate).not.toHaveBeenCalled()
    })

    it('disables an entry whose panel cannot be opened', () => {
        const container = render({activatables: {...allActivatable(), googleAccount: anActivatable({canActivate: false})}})

        expect(option(container, 'Google account').disabled).toBe(true)
        expect(option(container, 'Password').disabled).toBe(false)
    })

    it('shows the Google icon for a user connected to their Google account', () => {
        const select = render({googleAccount: true}).querySelector('.select')

        expect([select.dataset.icon, select.dataset.iconType]).toEqual(['google', 'brands'])
    })

    it('shows the user icon otherwise', () => {
        const select = render({googleAccount: false}).querySelector('.select')

        expect([select.dataset.icon, select.dataset.iconType]).toEqual(['user', undefined])
    })

    it('carries the hint that points users at it', () => {
        const select = render({hint: true}).querySelector('.select')

        expect(select.dataset.hint).toBe('true')
    })
})

const anActivatable = ({canActivate = true} = {}) => ({canActivate, activate: vi.fn()})

const allActivatable = () => ({
    userDetails: anActivatable(),
    changePassword: anActivatable(),
    googleAccount: anActivatable(),
    sshKeys: anActivatable()
})

// connect() is mocked away, so the stream prop it would inject subscribes directly.
const stream = (_name, stream$) => {
    stream$?.subscribe()
    return {active: false}
}

const optionLabels = container =>
    [...container.querySelectorAll('.option')].map(option => option.classList.contains('separator') ? '—' : option.textContent)

const option = (container, label) =>
    [...container.querySelectorAll('.option')].find(option => option.textContent === label)
