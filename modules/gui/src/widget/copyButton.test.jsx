import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The local acknowledgement that replaced the global "copied to clipboard" notification. The clipboard write is
// controllable so the window between click and resolution can be inspected, and Button is a stand-in that records
// what it is handed - what matters is the props the caller's button ends up with, not how it renders them.

const rendered = vi.hoisted(() => ({props: []}))
const clipboard = vi.hoisted(() => ({calls: [], pending: []}))

vi.mock('~/widget/button', () => ({
    Button: props => {
        rendered.props.push(props)
        return <button onClick={props.onClick}>copy</button>
    }
}))

vi.mock('~/translate', () => ({msg: key => key}))

vi.mock('~/clipboard', () => ({
    copyToClipboard: (value, options) => {
        clipboard.calls.push({value, options})
        return new Promise(resolve => clipboard.pending.push(resolve))
    }
}))

const {CopyButton} = await import('./copyButton')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ACKNOWLEDGEMENT_MS = 1000

let root
let container

const render = props => act(() => root.render(<CopyButton {...props}/>))

const click = () => act(() => container.querySelector('button').dispatchEvent(
    new window.MouseEvent('click', {bubbles: true})
))

const settle = (index, success) => act(() => {
    clipboard.pending[index](success)
    return Promise.resolve()
})

const lastProps = () => rendered.props[rendered.props.length - 1]
const icon = () => lastProps().icon
const status = () => container.querySelector('[role="status"]').textContent
const advance = ms => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
    vi.useFakeTimers()
    rendered.props = []
    clipboard.calls = []
    clipboard.pending = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
})

describe('acknowledging a successful copy', () => {
    it('shows a green check and announces it, then restores the caller icon', async () => {
        render({value: 'a-value', icon: 'copy', tooltip: 'copy this', tooltipVisible: false, tooltipDelay: 750})
        expect(icon()).toBe('copy')

        click()
        await settle(0, true)

        expect(lastProps()).toMatchObject({
            icon: 'circle-check',
            iconType: 'solid',
            iconVariant: 'success',
            tooltip: 'clipboard.copy.success',
            tooltipVisible: true,
            tooltipDelay: 0
        })
        expect(status()).toBe('clipboard.copy.success')

        advance(ACKNOWLEDGEMENT_MS)

        expect(lastProps()).toMatchObject({
            icon: 'copy',
            tooltip: 'copy this',
            tooltipVisible: false,
            tooltipDelay: 750
        })
        expect(status()).toBe('')
    })

    it('restarts the acknowledgement rather than letting the first timer end it', async () => {
        render({value: 'a-value', icon: 'copy'})

        click()
        await settle(0, true)
        advance(700)
        click()
        await settle(1, true)
        advance(700)

        expect(icon()).toBe('circle-check')

        advance(300)

        expect(icon()).toBe('copy')
    })
})

describe('when the acknowledgement no longer describes what is in hand', () => {
    it('clears immediately when the value changes', async () => {
        render({value: 'a-value', icon: 'copy'})
        click()
        await settle(0, true)
        expect(icon()).toBe('circle-check')

        render({value: 'another-value', icon: 'copy'})

        expect(icon()).toBe('copy')
        expect(vi.getTimerCount()).toBe(0)
    })

    // The write that is still in flight was for the old value; confirming it would confirm the wrong thing.
    it('ignores a write that resolves after the value changed', async () => {
        render({value: 'a-value', icon: 'copy'})
        click()

        render({value: 'another-value', icon: 'copy'})
        await settle(0, true)

        expect(icon()).toBe('copy')
        expect(status()).toBe('')
        expect(vi.getTimerCount()).toBe(0)
    })
})

describe('before the write resolves', () => {
    it('shows nothing, leaving the caller tooltip props alone', () => {
        render({value: 'a-value', icon: 'copy', tooltip: 'copy this', tooltipDelay: 750})

        click()

        expect(lastProps()).toMatchObject({icon: 'copy', tooltip: 'copy this', tooltipDelay: 750})
        expect(lastProps().tooltipVisible).toBeUndefined()
        expect(status()).toBe('')
    })
})

describe('when the copy does not succeed', () => {
    it('leaves the caller icon and tooltip alone', async () => {
        render({value: 'a-value', icon: 'copy', tooltip: 'copy this'})

        click()
        await settle(0, false)

        expect(lastProps()).toMatchObject({tooltip: 'copy this'})
        expect(lastProps().tooltipVisible).toBeUndefined()

        expect(icon()).toBe('copy')
        expect(status()).toBe('')
        expect(vi.getTimerCount()).toBe(0)
    })
})

describe('a write that outlives the button', () => {
    it('schedules nothing after unmount', async () => {
        render({value: 'a-value', icon: 'copy'})
        click()

        act(() => root.unmount())
        await settle(0, true)

        expect(vi.getTimerCount()).toBe(0)
        root = createRoot(container)
    })
})

describe('the caller presentation', () => {
    it('reaches the button untouched, and the value is not one of its props', () => {
        render({
            value: 'a-value',
            icon: 'copy',
            chromeless: true,
            shape: 'circle',
            size: 'x-small',
            air: 'none',
            tabIndex: -1,
            disabled: false,
            tooltip: 'copy this',
            additionalClassName: 'caller-class'
        })

        expect(lastProps()).toMatchObject({
            icon: 'copy',
            chromeless: true,
            shape: 'circle',
            size: 'x-small',
            air: 'none',
            tabIndex: -1,
            disabled: false,
            tooltip: 'copy this',
            additionalClassName: 'caller-class'
        })
        expect(lastProps()).not.toHaveProperty('value')
    })

    // A control can legitimately render with nothing to copy - the footer's build number before it is known.
    it('renders disabled without a value, copying nothing', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

        render({icon: 'copy', disabled: true})

        expect(clipboard.calls).toEqual([])
        expect(consoleError).not.toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('passes a caller failure message through to the clipboard helper', () => {
        render({value: 'a-value', icon: 'copy', failureMessage: 'custom failure'})

        click()

        expect(clipboard.calls).toEqual([{value: 'a-value', options: {failureMessage: 'custom failure'}}])
    })
})
