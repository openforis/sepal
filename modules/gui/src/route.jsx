import React from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router'

export const isPathInLocation = (path, locationPathname) =>
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
