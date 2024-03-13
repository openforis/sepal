import {isDevelopment} from '~/environment'
import {publishFatalError} from './eventPublisher'
import React from 'react'
import styles from './errorBoundary.module.css'

export class ErrorBoundary extends React.Component {
    state = {
        hasError: false,
        error: null,
    }

    static getDerivedStateFromError() {
        return {hasError: true}
    }

    componentDidCatch({message, stack}, {componentStack}) {
        this.setState({error: {message, stack, componentStack}})
        publishFatalError([stack, componentStack].join('\n'))
    }

    render() {
        const {hasError} = this.state
        return hasError
            ? isDevelopment()
                ? this.renderDevelopmentError()
                : this.renderProductionError()
            : this.renderNormal()
    }

    renderDevelopmentError() {
        const {error} = this.state
        if (error) {
            const [message, ...stackLines] = (error.stack || '').split('\n')
            const componentStackLines = (error.componentStack || '').split('\n')
            return (
                <div className={styles.developmentError}>
                    <div>
                        <div className={styles.title}>
                            {message || error.message}
                        </div>
                        <div className={styles.stack}>
                            {stackLines.map((line, index) => <div key={index}>{line}</div>)}
                        </div>
                        <div className={styles.title}>
                            Component stack
                        </div>
                        <div className={styles.stack}>
                            {componentStackLines.map((line, index) => <div key={index}>{line}</div>)}
                        </div>
                    </div>
                </div>
            )
        }
        return null
    }

    renderProductionError() {
        return (
            <div className={styles.productionError}>
                <h3>
                    We are terribly sorry, but something went wrong with SEPAL.
                </h3>
                <p>
                    This is of course very embarrassing for us, and frustrating for you.
                    Please, reload the page and try again.
                    If this keeps on happening, report this to the SEPAL team and we will try to fix this issue
                    as quick as possible.
                </p>
            </div>
        )
    }

    renderNormal() {
        const {children} = this.props
        return children
    }
}
