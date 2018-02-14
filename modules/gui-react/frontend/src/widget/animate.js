import React from 'react'
import {CSSTransition, TransitionGroup} from 'react-transition-group'
import PropTypes from 'prop-types'
import styles from './animate.module.css'

export class AnimateEnter extends React.Component {
    render() {
        const name = this.props.name in styles ? styles[this.props.name] : this.props.name
        const duration = this.props.duration || 1000
        const delay = this.props.delay || 0
        const timeout = duration + delay
        const className = `animation_${name}_${randomString()}`
        return (
            <div>
                <style>{`
          .${className}-appear {
            animation: ${name} ${duration}ms ${delay}ms ease-in-out backwards;
          }
        `}
                </style>
                <CSSTransition
                    in={true}
                    appear={true}
                    exit={false}
                    timeout={timeout}
                    classNames={className}>
                    {this.props.children}
                </CSSTransition>
            </div>
        )
    }

    static fadeInUp = 'fadeInUp'
    static fadeInDown = 'fadeInDown'
    static fadeInLeft = 'fadeInLeft'
    static fadeInRight = 'fadeInRight'
}

AnimateEnter.propTypes = {
    name: PropTypes.string.isRequired,
    duration: PropTypes.number,
    delay: PropTypes.number,
}

export class AnimateUl extends React.Component {
    render() {
        return (
            <div>
                <TransitionGroup component='ul' {...this.props}>
                    {this.props.children.map((child, i) => (
                            <CSSTransition
                                key={child.key}
                                timeout={500}
                                classNames={{
                                    enterActive: styles.itemEnterActive,
                                    exitActive: styles.itemExitActive,
                                }}>
                                {child}
                            </CSSTransition>
                        )
                    )}
                </TransitionGroup>
            </div>
        )
    }
}

function randomString() {
    return Math.random().toString(36).substring(2, 15)
        + Math.random().toString(36).substring(2, 15)
}