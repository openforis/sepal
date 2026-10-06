import {ProgressReporter} from './progressReporter.js'

test('sends a status once, and again only when it changes', () => {
    const sent = []
    const reporter = new ProgressReporter({send: description => sent.push(description)})

    reporter.report({messageKey: 'a'})
    reporter.report({messageKey: 'a'})
    reporter.report({messageKey: 'b'})

    expect(sent).toEqual([{messageKey: 'a'}, {messageKey: 'b'}])
})

test('a heartbeat repeats the last status, so task-manager knows the container is alive', () => {
    const sent = []
    const reporter = new ProgressReporter({send: description => sent.push(description)})

    reporter.heartbeat()
    reporter.report({messageKey: 'a'})
    reporter.heartbeat()

    expect(sent).toEqual([{messageKey: 'a'}, {messageKey: 'a'}])
})

test('a status that cannot be delivered does not stop the task', () => {
    const reporter = new ProgressReporter({send: () => Promise.reject(new Error('gateway down'))})

    expect(() => reporter.report({messageKey: 'a'})).not.toThrow()
})
