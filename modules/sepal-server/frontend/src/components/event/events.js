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
        , SHOW: 'section.show'

        , REDUCE: 'section.reduce'

        , SEARCH: {
            SHOW_SCENE_AREA: 'section.search.show-scene-area'
        }

        , BROWSE: {}

        , PROCESS: {}

        , TERMINAL: {}
    }

    , MAP: {
        ZOOM_TO: 'map.zoom-to'
        , LOAD_SCENE_AREAS: 'map.load-scene-areas'
        , SCENE_AREA_CLICK: 'map.scene-area-click'
    }

}

module.exports = Events