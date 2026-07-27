import toDateString from './toDateString'

it('formats epoch milliseconds (UTC) to YYYY-MM-DD', () => {
    expect(toDateString(1609459200000)).toEqual('2021-01-01')
})
it('passes a YYYY-MM-DD string through', () => {
    expect(toDateString('2020-12-31')).toEqual('2020-12-31')
})
it('truncates an ISO string to the date', () => {
    expect(toDateString('2020-12-31T10:11:12.000Z')).toEqual('2020-12-31')
})
it('formats a Moment-like value via .format', () => {
    const moment = {format: fmt => (fmt === 'YYYY-MM-DD' ? '2020-06-30' : '')}
    expect(toDateString(moment)).toEqual('2020-06-30')
})
it('returns null/undefined unchanged', () => {
    expect(toDateString(null)).toEqual(null)
    expect(toDateString(undefined)).toEqual(undefined)
})
