const {parseGroups} = require('./parse')

it('parses empty groups', () => {
    expect(
        parseGroups('groups\n"[]"')
    ).toEqual(
        {
            groups: []
        }
    )
})

it('parses groups', () => {
    expect(
        parseGroups('groups\n"[{stratum=0, sum=5.1}, {stratum=1, sum=4.1}]"')
    ).toEqual(
        {
            groups: [
                {stratum: 0, sum: 5.1},
                {stratum: 1, sum: 4.1},
            ]
        }
    )
})
