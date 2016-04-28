/**
 * Application Events class
 *
 * @author Mino Togna
 */

Events = {

    AJAX: {
        REQUEST: 'ajax'
    }

    , USER: {
        LOGGED: 'user.logged'
    }

    , APP: {
        LOAD: 'app.load'
        , DESTROY: 'app.destroy'
    }

    , LOGIN: {
        HIDE: 'login.hide'
        , SHOW: 'login.show'
    }

    , SECTION: {
        CLOSE_ALL: 'section.close-all'
        
        , REDUCE: 'section.reduce'
        
        , SEARCH: {
            SHOW: 'section.search.show'
            , GET_SCENE_AREA: 'section.search.get-scene-area'
        }
        
        , BROWSE: {
            SHOW: 'section.browse.show'
        }
        
        , PROCESS: {
            SHOW: 'section.process.show'
        }
        
        , TERMINAL: {
            SHOW: 'section.terminal.show'
        }
    }
    
    , MAP: {
        ZOOM_TO: 'map.zoom-to'
        , LOAD_SCENES: 'map.load-scenes'
    }
    
}

module.exports = Events