import React from 'react'

const isClassComponent = component =>
    !!component?.prototype?.isReactComponent

export const asFunctionalComponent = (defaultProps = {}) =>
    component =>
        ({ref, children, ...props}) => {
            if (!isClassComponent(component)) {
                throw Error('Cannot use asFunctionalComponent with functional components')
            }
            const refProps = ref
                ? isClassComponent(component)
                    ? {forwardedRef: ref}
                    : {ref}
                : {}
            return React.createElement(component, {
                ...refProps,
                ...defaultProps,
                ...Object.fromEntries(
                    Object.entries(props).filter(
                        ([_, value]) => value !== undefined
                    )
                )
            }, children)
        }
