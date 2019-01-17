import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'

const Portal = ({container = document.getElementById('portalContainer'), content, children}) =>
    ReactDOM.createPortal(content || children, container || null)

Portal.propTypes = {
    children: PropTypes.any,
    container: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    content: PropTypes.any
}

export default Portal
