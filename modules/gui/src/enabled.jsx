import PropTypes from 'prop-types'
import React from 'react'

import {composeHoC} from '~/compose'
import {isMobile} from '~/widget/userAgent'

export const EnabledContext = React.createContext()

export class Enabled extends React.PureComponent {
    constructor() {
        super()
        this.renderEnabled = this.renderEnabled.bind(this)
    }

    render() {
        return (
            <EnabledContext.Consumer>
                {this.renderEnabled}
            </EnabledContext.Consumer>
        )
    }

    renderEnabled(parentEnabled) {
        const {enabled} = this.props
        return this.renderChildren(enabled !== false && parentEnabled !== false)
    }

    renderChildren(enabled) {
        const {className, enabledClassName, disabledClassName, children} = this.props
        return (
            <div
                style={{
                    height: '100%',
                    width: '100%'
                }}
                className={[
                    className,
                    enabled ? enabledClassName : disabledClassName,
                ].join(' ')}>
                <EnabledContext.Provider value={enabled}>
                    {children}
                </EnabledContext.Provider>
            </div>
        )
    }

    componentDidUpdate({enabled: wasEnabled}) {
        const {enabled} = this.props
        if (!enabled && enabled !== wasEnabled && document.activeElement && isMobile()) {
            document.activeElement && document.activeElement.blur()
        }
    }
}

Enabled.propTypes = {
    children: PropTypes.any.isRequired,
    enabled: PropTypes.any.isRequired,
    className: PropTypes.string,
    disabledClassName: PropTypes.string,
    enabledClassName: PropTypes.string
}

const withEnabled = () =>
    WrappedComponent =>
        class WithEnabledHoC extends React.Component {
            constructor() {
                super()
                this.renderEnabled = this.renderEnabled.bind(this)
            }

            render() {
                return (
                    <EnabledContext.Consumer>
                        {this.renderEnabled}
                    </EnabledContext.Consumer>
                )
            }

            renderEnabled(enabled) {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    enabled
                })
            }
        }

export const withPreventUpdateWhenDisabled = () =>
    composeHoC(
        WrappedComponent =>
            class PreventUpdateWhenDisabledHoC extends React.Component {
                render() {
                    return React.createElement(WrappedComponent, this.props)
                }

                shouldComponentUpdate({enabled}) {
                    return enabled !== false
                }
            },
        withEnabled()
    )

export const withEnableDetector = () =>
    composeHoC(
        WrappedComponent =>
            class WithEnableDetectorHOC extends React.Component {
                onEnable = null
                onDisable = null
                onChange = null

                constructor() {
                    super()
                    this.setOnEnable = this.setOnEnable.bind(this)
                    this.setOnDisable = this.setOnDisable.bind(this)
                    this.setOnChange = this.setOnChange.bind(this)
                    this.isEnabled = this.isEnabled.bind(this)
                }

                setOnEnable(onEnable) {
                    this.onEnable = onEnable
                }

                setOnDisable(onDisable) {
                    this.onDisable = onDisable
                }

                setOnChange(onChange) {
                    this.onChange = onChange
                }

                isEnabled() {
                    const {enabled} = this.props
                    return enabled
                }

                render() {
                    return React.createElement(WrappedComponent, {
                        ...this.props,
                        enableDetector: {
                            onEnable: this.setOnEnable,
                            onDisable: this.setOnDisable,
                            onChange: this.setOnChange,
                            isEnabled: this.isEnabled
                        }
                    })
                }

                componentDidMount() {
                    const {enabled} = this.props
                    if (enabled) {
                        if (this.onEnable) {
                            this.onEnable()
                        }
                        if (this.onChange) {
                            this.onChange(true)
                        }
                    }
                }

                componentDidUpdate({enabled: wasEnabled}) {
                    const {enabled} = this.props
                    const nowEnabled = enabled === true && wasEnabled !== true
                    const nowDisabled = enabled === false && wasEnabled !== false
                    const changed = nowEnabled || nowDisabled
                    if (this.onEnable && nowEnabled) {
                        this.onEnable()
                    } else if (this.onDisable && nowDisabled) {
                        this.onDisable()
                    }
                    if (this.onChange && changed) {
                        this.onChange(enabled)
                    }
                }
            },
        withEnabled()
    )
