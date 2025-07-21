import React from 'react'

const isClassComponent = component =>
    !!component?.prototype?.isReactComponent

export const asFunctionalComponent = (defaultProps = {}) =>
    component =>
        ({ref, children, ...props}) => {
            if (!isClassComponent(component)) {
                throw Error('Can only use asFunctionalComponent() HOC with class components')
            }
            const refProps = ref
                ? {forwardedRef: ref}
                : {}
            const validProps = Object.fromEntries(
                Object.entries(props).filter(
                    ([_, value]) => value !== undefined
                )
            )
            return React.createElement(component, {
                ...refProps,
                ...defaultProps,
                ...validProps
            }, children)
        }
