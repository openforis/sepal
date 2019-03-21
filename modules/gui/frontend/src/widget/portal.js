import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'

const Portal = ({container, containerId, content, children}) => {
    if (container && containerId) {
        throw new Error('Portal can be passed either a container or a containerId, not both.')
    }
    return ReactDOM.createPortal(
        content || children,
        container || document.getElementById(containerId || 'fullScreenPortalContainer')
    )
}

Portal.propTypes = {
    children: PropTypes.any,
    container: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    containerId: PropTypes.string,
    content: PropTypes.any
}

export default Portal
