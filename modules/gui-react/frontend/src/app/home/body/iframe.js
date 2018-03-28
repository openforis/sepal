import React from 'react'
import {connect} from 'store'
import {appReady, appState} from 'apps'
import {CenteredProgress} from 'widget/progress'
import {msg} from 'translate'
import PropTypes from 'prop-types'

const mapStateToProps = (_, currentProps) => ({
    appState: appState(currentProps.app.path),
})

class IFrame extends React.Component {
    initializing(label, alt) {
        return <CenteredProgress title={msg('apps.initializing', {label: label || alt})}/>
    }
    loading(label, alt) {
        return <CenteredProgress title={msg('apps.loading', {label: label || alt})}/>
    }
    render() {
        const {app: {path, label, alt}, appState} = this.props
        if (appState === 'REQUESTED') 
            return this.initializing(label, alt)
        
        return appState === 'REQUESTED' 
            ? this.initializing(label, alt)
            : (
                <div>
                    {appState !== 'READY' && this.loading(label, alt)}
                    <iframe
                        ref={(iframe) => this.iframe = iframe}
                        width='100%'
                        height='100%'
                        frameBorder='0'
                        src={path} 
                        title={label || alt}
                        style={{display: appState === 'READY' ? 'block' : 'none'}}
                        onLoad={() => appReady(this.props.app)}
                    />
                </div>
            )
    }
}

export default IFrame = connect(mapStateToProps)(IFrame)

IFrame.propTypes = {
    path: PropTypes.string,
    label: PropTypes.string,
    alt: PropTypes.string,
    appState: PropTypes.string
}

IFrame.contextTypes = {
    active: PropTypes.bool,
    focus: PropTypes.func
}
