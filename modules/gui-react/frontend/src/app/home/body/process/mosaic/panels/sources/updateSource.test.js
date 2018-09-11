import updateSource from './updateSource'

it('no source, in range for both landsat and sentinel2 -> no source or data set', () => {
    expect(
        updateSource(null, null, '2018-01-01', '2019-01-01')
    ).toEqual(
        [null, []]
    )
})
it('no source, out of range for sentinel2 -> landsat and [landsat8]', () => {
    expect(
        updateSource(null, null, '2013-01-01', '2014-01-01')
    ).toEqual(
        ['landsat', ['landsat8']]
    )
})
it('landsat, null data set -> landsat and default data set', () => {
    expect(
        updateSource('landsat', null, '2018-01-01', '2019-01-01')
    ).toEqual(
        ['landsat', ['landsat8']]
    )
})
it('landsat, empty data set -> landsat and empty data set', () => {
    expect(
        updateSource('landsat', [], '2018-01-01', '2019-01-01')
    ).toEqual(
        ['landsat', []]
    )
})
it('source and data sets in range -> same source and data sets', () => {
    expect(
        updateSource('landsat', ['landsat8'], '2018-01-01', '2019-01-01')
    ).toEqual(
        ['landsat', ['landsat8']]
    )
})

it('data set out of range -> same source, highest quality data sets in range', () => {
    expect(
        updateSource('landsat', ['landsat8'], '1985-01-01', '2010-01-01')
    ).toEqual(
        ['landsat', ['landsat7', 'landsat45']]
    )
})

it('source out of range -> in range source, highest quality data sets in range', () => {
    expect(
        updateSource('sentinel2', ['sentinel2'], '1985-01-01', '2010-01-01')
    ).toEqual(
        ['landsat', ['landsat7', 'landsat45']]
    )
})

it('toDate on first date of a data set -> data set is excluded', () => {
    expect(
        updateSource('sentinel2', ['sentinel2'], '2012-01-01', '2013-01-01')
    ).toEqual(
        ['landsat', ['landsat7', 'landsat45']]
    )
})
