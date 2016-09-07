/**
 * Application Events class
 *
 * @author Mino Togna
 */

var Events = {
    
    AJAX: {
        REQUEST: 'ajax.request'
        , GET  : 'ajax.get'
        , POST : 'ajax.post'
    }
    
    , APP: {
        LOAD              : 'app.load'
        , DESTROY         : 'app.destroy'
        , REGISTER_ELEMENT: 'app.register-element'
        , USER_LOGGED_IN  : 'app.user-logged-in'
    }
    
    , LOGIN: {
        HIDE  : 'login.hide'
        , SHOW: 'login.show'
    }
    
    , SECTION: {
        CLOSE_ALL: 'section.close-all'
        , SHOW   : 'section.show'
        , SHOWN  : 'section.shown'
        , REDUCE : 'section.reduce'
        
        , NAV_MENU: {
            LOADED: 'section.nav-menu.loaded'
        }
        
        , SEARCH: {
            // SHOW_SCENE_AREA: 'section.search.show-scene-area'
            FORM_SUBMIT         : 'section.search.form-submit'
            , SCENE_AREAS_LOADED: 'section.search.scene-areas-loaded'
            
            , SEARCH_PARAMS: {
                WEIGHT_CHANGE              : 'section.search.search-params.weight-change'
                , WEIGHT_CHANGED           : 'section.search.search-params.weight-changed'
                , OFFSET_TARGET_DAY_CHANGE : 'section.search.search-params.offset-target-day-change'
                , OFFSET_TARGET_DAY_CHANGED: 'section.search.search-params.offset-target-day-changed'
                , SELECT_SENSOR            : 'section.search.search-params.select-sensor'
                , DESELECT_SENSOR          : 'section.search.search-params.deselect-sensor'
                , SENSORS_CHANGED          : 'section.search.search-params.sensors-changed'
            }
            
        }
        
        , SEARCH_RETRIEVE: {
            BEST_SCENES      : 'section.search-retrieve.best-scenes'
            , RETRIEVE_SCENES: 'section.search-retrieve.retrieve-scenes'
            , PREVIEW_MOSAIC : 'section.search-retrieve.preview-mosaic'
            , RETRIEVE_MOSAIC: 'section.search-retrieve.retrieve-mosaic'
        }
        
        , BROWSE: {
            NAV_ITEM_CLICK : 'section.browse.nav-item-click'
            , DOWNLOAD_ITEM: 'section.browse.download-item'
        }
        
        , PROCESS: {}
        
        , TERMINAL: {}
        
        , SCENES_SELECTION: {
            RESET          : 'section.scenes-selection.reset'
            , SELECT       : 'section.scenes-selection.select'
            , DESELECT     : 'section.scenes-selection.deselect'
            , RELOAD_SCENES: 'section.scenes-selection.reload-scenes'
        }
        
        , TASK_MANAGER: {
            REMOVE_TASK   : 'section.task-manager.remove-task'
            , CANCEL_TASK : 'section.task-manager.cancel-task'
            , EXECUTE_TASK: 'section.task-manager.execute-task'
            , CHECK_STATUS: 'section.task-manager.check-status'
        }
        
        , USER : {
            REMOVE_SESSION     : 'section.user.remove-session'
            , SAVE_USER_DETAILS: 'section.user.save-user-details'
            , CHANGE_PASSWORD  : 'section.user.change-password'
        }
        , USERS: {
            LIST_FILTER_CHANGE: 'section.users.list-filter-change'
            , SELECT_USER     : 'section.users.select-user'
            , SHOW_USERS_LIST : 'section.users.show-users-list'
            , SHOW_INVITE_USER: 'section.users.show-invite-user'
            , SHOW_EDIT_USER  : 'section.users.show-edit-user'
            , SHOW_DELETE_USER: 'section.users.show-delete-user'
        }
    }
    
    , MAP: {
        ZOOM_TO                       : 'map.zoom-to'
        , ZOOM_CHANGED                : 'map.zoom-changed'
        // , LOAD_SCENE_AREAS: 'map.load-scene-areas'
        , SCENE_AREA_CLICK            : 'map.scene-area-click'
        , ADD_LAYER                   : 'map.add-layer'
        , ADD_EE_LAYER                : 'map.add-ee-layer'
        , REMOVE_EE_LAYER             : 'map.remove-ee-layer'
        , EE_LAYER_TOGGLE_VISIBILITY  : 'map.remove-ee-layer-toggle-visibility'
        , SCENE_AREA_RESET            : 'map.scene-area-reset'
        , SCENE_AREA_TOGGLE_VISIBILITY: 'map.scene-area-toggle-visibility'
        , ADD_OVERLAY_MAP_TYPE        : 'map.add-overlay-map-type'
        , REMOVE_OVERLAY_MAP_TYPE     : 'map.remove-overlay-map-type'
        , POLYGON_DRAW                : 'map.polygon-draw'
        , POLYGON_DRAWN               : 'map.polygon-drawn'
        , POLYGON_CLEAR               : 'map.polygon-clear'
    }
    
    // events that occur when a model changes
    , MODEL: {
        SCENE_AREA: {
            CHANGE: 'model.scene-area-change'
        }
    }
    
    , USER: {
        USER_DETAILS_LOADED: "user.user-details-loaded"
    }
    
}

module.exports = Events