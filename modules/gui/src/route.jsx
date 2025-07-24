import React from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router'

import {withProps} from './hoc'

export const isPathInLocation = (path, locationPathname) =>
    new RegExp(`^${path}([?#/].*)?$`).test(locationPathname)

export const withLocation = () =>
    withProps(() => {
        const location = useLocation()
        return {location}
    })

export const withSearchParams = () =>
    withProps(() => {
        const [searchParams] = useSearchParams()
        return {searchParams}
    })

export const withNavigation = () =>
    withProps(() => {
        const navigate = useNavigate()
        return {navigate}
    })
