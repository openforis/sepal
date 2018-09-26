import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'

const Portal = ({container = document.body, content, children}) =>
    ReactDOM.createPortal(content || children, container)

Portal.propTypes = {
    children: PropTypes.any,
    container: PropTypes.object,
    content: PropTypes.any
}

export default Portal
