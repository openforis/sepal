import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {registerGuiAction as registerAction} from '~/app/home/body/chat/guiActionRegistry'
import {countryEETable} from '~/app/home/map/aoiLayer'
import {getLogger} from '~/log'
import {select} from '~/store'

import {respondError} from './response'

const log = getLogger('chat-aoi-actions')
const toCountryAoi = ({value, label}) => ({
    label,
    aoi: {type: 'EE_TABLE', id: countryEETable, keyColumn: 'id', key: value, level: 'COUNTRY', buffer: 0}
})

const toAreaAoi = ({value, label}) => ({
    label,
    aoi: {type: 'EE_TABLE', id: countryEETable, keyColumn: 'id', key: value, level: 'AREA', buffer: 0}
})

const listCountries = ({respond}) => {
    const cached = select('countries')
    if (cached) {
        respond({success: true, data: cached.map(toCountryAoi)})
        return
    }
    api.gee.queryEETable$({
        select: ['id', 'label'],
        from: countryEETable,
        where: [['parent_id', 'equals', null]],
        distinct: ['id'],
        orderBy: ['label']
    }).subscribe({
        next: rows => {
            const countries = rows.map(({id, label}) => ({value: id, label}))
            actionBuilder('SET_COUNTRIES', {countries})
                .set('countries', countries)
                .dispatch()
            respond({success: true, data: countries.map(toCountryAoi)})
        },
        error: error => respondError({log, respond, fallback: 'Failed to load countries', error})
    })
}

const listCountryAreas = ({countryId, respond}) => {
    if (!countryId) {
        respond({success: false, error: 'countryId is required'})
        return
    }
    const cached = select(['areasByCountry', countryId])
    if (cached) {
        respond({success: true, data: cached.map(toAreaAoi)})
        return
    }
    api.gee.queryEETable$({
        select: ['id', 'label'],
        from: countryEETable,
        where: [['parent_id', 'equals', countryId]],
        orderBy: ['label']
    }).subscribe({
        next: rows => {
            const areas = rows.map(({id, label}) => ({value: id, label}))
            actionBuilder('SET_COUNTRY_AREA', {countryId, areas})
                .set(['areasByCountry', countryId], areas)
                .dispatch()
            respond({success: true, data: areas.map(toAreaAoi)})
        },
        error: error => respondError({log, respond, fallback: 'Failed to load country areas', error})
    })
}

export const registerAoiActions = () => {
    registerAction('list-countries', listCountries)
    registerAction('list-country-areas', listCountryAreas)
}
