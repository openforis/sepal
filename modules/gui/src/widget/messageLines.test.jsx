import {describe, expect, it} from 'vitest'

import {messageLines, messageTextLines} from './messageLines'
import {SessionName} from './sessionName'

const Name = ({children}) => <span>{children}</span>

describe('messageLines', () => {
    it('splits a plain message at each separator', () => {
        expect(messageLines('one|two')).toEqual([['one'], ['two']])
    })

    it('keeps an element on the line it was formatted into', () => {
        const name = <Name key='n'>humble-robin</Name>
        expect(messageLines(['You are stopping session ', name, '.|Running on it:']))
            .toEqual([['You are stopping session ', name, '.'], ['Running on it:']])
    })
})

describe('messageTextLines', () => {
    it('reads a session tag as its name and type', () => {
        const tag = <SessionName key='n' name='humble-robin' type='t1'/>
        expect(messageTextLines(['Session ', tag, '|closed'])).toEqual(['Session humble-robin t1', 'closed'])
    })

    it('reads the text of the elements in a rich message', () => {
        const name = <Name key='n'><>humble-robin</></Name>
        expect(messageTextLines(['Session ', name, ' (t1)|closed'])).toEqual(['Session humble-robin (t1)', 'closed'])
    })
})
