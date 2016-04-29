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
            // SHOW_SCENE_AREA: 'section.search.show-scene-area'
        }

        , BROWSE: {}

        , PROCESS: {}

        , TERMINAL: {}

        , SCENE_IMAGES_SELECTION: {
            UPDATE: 'section.scenes-selection-update'
        }
    }

    , MAP: {
        ZOOM_TO: 'map.zoom-to'
        , LOAD_SCENE_AREAS: 'map.load-scene-areas'
        , SCENE_AREA_CLICK: 'map.scene-area-click'
        , ADD_LAYER: 'map.add-layer'
    }

}

module.exports = Events