import React from 'react'
import {connect} from 'store'
import PropTypes from 'prop-types'
import {appReady, appState} from 'apps'
import {CenteredProgress} from 'widget/progress'
import {msg} from 'translate'

const mapStateToProps = (_, currentProps) => ({
    appState: appState(currentProps.app.path),
})

class IFrame extends React.Component {
    render() {
        const {app: {path, label, alt}, appState} = this.props
        const loadingProgress = appState === 'READY'
            ? null
            : <CenteredProgress title={msg('apps.loading', {label: label || alt})}/>
        if (appState === 'REQUESTED')
            return <CenteredProgress title={msg('apps.initializing', {label: label || alt})}/>
        else
            return (
                <div>
                    {loadingProgress}
                    <iframe
                        ref={(iframe) => this.iframe = iframe}
                        width='100%'
                        height='100%'
                        frameBorder='0'
                        src={path} title={label || alt}
                        style={{display: appState === 'READY' ? 'block' : 'none'}}
                    />
                </div>
            )
    }

    componentDidUpdate() {
        this.addReadyListener(this.props)
    }

    addReadyListener({appState, app}) {
        if (!this.ready && appState === 'INITIALIZED') {
            this.ready = true
            this.iframe.contentWindow.document.addEventListener(
                'load',
                appReady(app),
                // () => appReady(app),
                false)
        }
    }
}

export default IFrame = connect(mapStateToProps)(IFrame)

IFrame.contextTypes = {
    active: PropTypes.bool,
    focus: PropTypes.func
}
