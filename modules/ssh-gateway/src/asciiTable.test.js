import {table, td, th, tr} from './asciiTable.js'
import {format} from './console.js'

// eslint-disable-next-line no-control-regex
const visible = text => text.replace(/\u001B\[[0-9;]*m/g, '')

test('pads a styled value by the width it takes on screen', () => {
    const rendered = table([
        th([td({value: 'Title', colSpan: 2})]),
        tr([td({value: `${format('in ', 'CYAN')}${format('/tmp', 'YELLOW')}`, colSpan: 2})]),
        tr([td({value: 'column'}), td({value: 'other column'})])
    ])
    const widths = visible(rendered).trim().split('\n').map(line => line.length)
    expect(new Set(widths).size).toBe(1)
})

test('sizes a column by the visible width of its styled values', () => {
    const rendered = table([
        tr([td({value: format('wide value', 'YELLOW')}), td({value: 'x'})]),
        tr([td({value: 'a'}), td({value: 'b'})])
    ])
    expect(visible(rendered)).toContain('┃ a          │ b ┃')
})
