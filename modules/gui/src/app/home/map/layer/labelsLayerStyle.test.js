import {
    DEFAULT_LABELS_STYLE,
    LABELS_CATEGORIES,
    labelsBaseStyle,
    labelsMapTypeStyles,
    resolveLabelsStyle,
    withUpdatedLabelsCategories
} from './labelsLayerStyle'

describe('resolveLabelsStyle', () => {
    it('defaults to every category enabled', () => {
        expect(resolveLabelsStyle()).toEqual({
            categories: {administrative: true, landscape: true, poi: true, road: true, transit: true, water: true}
        })
    })

    it('merges a partial persisted style without dropping the categories it omits', () => {
        expect(resolveLabelsStyle({style: {categories: {road: false}}})).toEqual({
            categories: {administrative: true, landscape: true, poi: true, road: false, transit: true, water: true}
        })
    })

    // Labels carries no opacity. A value left behind by earlier uncommitted work must not survive.
    it('drops anything the persisted style carries beyond categories', () => {
        expect(resolveLabelsStyle({style: {opacity: 0.5, categories: {road: false}}})).not.toHaveProperty('opacity')
    })

    it('never shares mutable category state between resolves', () => {
        const style = resolveLabelsStyle()
        style.categories.road = false

        expect(resolveLabelsStyle().categories.road).toBe(true)
        expect(DEFAULT_LABELS_STYLE.categories.road).toBe(true)
    })
})

describe('withUpdatedLabelsCategories', () => {
    it('persists the categories and nothing else', () => {
        const categories = {...DEFAULT_LABELS_STYLE.categories, water: false}

        expect(withUpdatedLabelsCategories(categories)).toEqual({categories})
    })

    it('copies the categories it is given', () => {
        const categories = {...DEFAULT_LABELS_STYLE.categories}
        const result = withUpdatedLabelsCategories(categories)
        categories.water = false

        expect(result.categories.water).toBe(true)
    })
})

describe('labelsMapTypeStyles', () => {
    it('leaves the base style untouched when every category is enabled', () => {
        expect(labelsMapTypeStyles(resolveLabelsStyle())).toEqual(labelsBaseStyle)
    })

    it('appends an off rule only for the disabled category, after the base style', () => {
        const styles = labelsMapTypeStyles(resolveLabelsStyle({style: {categories: {road: false}}}))

        expect(styles.slice(0, labelsBaseStyle.length)).toEqual(labelsBaseStyle)
        expect(styles.slice(labelsBaseStyle.length)).toEqual([{featureType: 'road', stylers: [{visibility: 'off'}]}])
    })

    it('appends one off rule per disabled category, in a stable order', () => {
        const categories = {...DEFAULT_LABELS_STYLE.categories, water: false, administrative: false}
        const styles = labelsMapTypeStyles({...DEFAULT_LABELS_STYLE, categories})

        expect(styles.slice(labelsBaseStyle.length)).toEqual([
            {featureType: 'administrative', stylers: [{visibility: 'off'}]},
            {featureType: 'water', stylers: [{visibility: 'off'}]}
        ])
    })

    it('names the six categories the panel offers', () => {
        expect(LABELS_CATEGORIES).toEqual(['administrative', 'landscape', 'poi', 'road', 'transit', 'water'])
    })
})
