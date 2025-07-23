// import PropTypes from 'prop-types'
import QueryString from 'qs'
import React from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'

import {state} from '~/store'

export const location = () => state().location

export const query = () => {
    let queryString = location().search
    if (queryString.startsWith('?'))
        queryString = queryString.substring(1)
    return QueryString.parse(queryString)
}

export const isPathInLocation = (path, locationPathname = location().pathname) =>
    new RegExp(`^${path}([?#/].*)?$`).test(locationPathname)

export const withLocation = () =>
    WrappedComponent =>
        ({children, ...props}) => {
            const location = useLocation()
            return React.createElement(WrappedComponent, {
                ...props,
                location
            }, children)
        }

export const withSearchParams = () =>
    WrappedComponent =>
        ({children, ...props}) => {
            const [searchParams] = useSearchParams()
            return React.createElement(WrappedComponent, {
                ...props,
                searchParams
            }, children)
        }

export const withNavigation = () =>
    WrappedComponent =>
        ({children, ...props}) => {
            const navigate = useNavigate()
            return React.createElement(WrappedComponent, {
                ...props,
                navigate
            }, children)
        }
