<?php

class UsersController extends \BaseController {
    protected $layout = 'layouts.master';

    function __construct() {
        $this->beforeFilter(function () {
            if (Session::get('is_admin') != 'yes') {
                return Redirect::to('search')
                    ->with('error', 'Permission denied!');
            }
        });
    }

    //POST process form inputs from add Roles form
    public function create() {
        $rules = array(
            'firstName' => 'required|min:4|max:50',
            'userName' => array('required', 'min:1', 'max:20', 'unique:users,username', 'regex:$[a-z_][a-z0-9_-]{3,30}$'),
            'email' => 'required|email|max:120|unique:users,email',
            'password' => array('required', 'regex:$\S*(?=\S{8,})(?=\S*[a-z])(?=\S*[A-Z])(?=\S*[\d])\S*$'),
            'confirmPassword' => 'required|same:password'
        );
        $messages = array(
            'userName.regex' => 'Username must start with a lowercase letter, must be between 4 and 31 characters long, and can only contain letters, numbers, "_" and "-".',
            'password.regex' => 'Password must contain atleast one lowercase letter, one uppercase letter, one number and a minimum of 8 characters.',
        );
        $v = Validator::make(Input::all(), $rules, $messages);

        // Setting attribute for readable format   
        $attributeNames = array(
            'firstName' => 'first name',
            'userName' => 'user name',
            'email' => 'email',
            'password' => 'password',
            'confirmPassword' => 'confirm password'
        );
        $v->setAttributeNames($attributeNames);

        if ($v->fails())
            return Redirect::to('adduser')
                ->withErrors($v)
                ->withInput();

        $user = new User;
        $user->username = Input::get('userName');
        $user->full_name = Input::get('firstName');
        $user->email = Input::get('email');
        if ($user->save()) {
            $username = Input::get('userName');
            $password = Input::get('password');
            $uid = $this->sshCreateUser($username, $password);
            Logger::debug('Newly created uid: ', $uid);
            $user->user_uid = $uid;
            Logger::debug('UserCreatedId: ', $user->user_uid);
            $user->save();
            $logged_in_user = Auth::id();
            // Only admin can assign role. Else role 'user' by default.
            if (Session::get('is_admin') == 'yes') {
                $role_id = Input::get('role');
            } else
                $role_id = "";
            $date = new \DateTime;
            // If success, add role to the user.
            if ($role_id > 0) {
                $user->roles()->attach($role_id, array('created_by' => $logged_in_user, 'created_at' => $date, 'updated_at' => $date));
            }
        }

        return Redirect::to('users')
            ->with('message', 'User added!');
    }

    //POST process form inputs from add Roles form
    public function update($id = NULL) {
        //check if logged in user has access to edit the page
        $access = $this->checkUserAccess();
        if ($access == false)
            return Redirect::to('users')
                ->with('error', 'Permission denied!');
        // Validation rules
        $rules = array(
            'firstName' => 'required|min:4|max:50',
            'email' => 'required|email|max:120|unique:users,email,' . $id . '',
            'password' => array('regex:$\S*(?=\S{8,})(?=\S*[a-z])(?=\S*[A-Z])(?=\S*[\d])\S*$'),
            'confirmPassword' => 'same:password'
        );
        $messages = array(
            'password.regex' => 'Password must contain atleast one lowercase letter, one uppercase letter, one number and a minimum of 8 characters.',
        );
        // Validate the inputs
        $v = Validator::make(Input::all(), $rules, $messages);

        // Setting attribute for readable format   
        $attributeNames = array(
            'firstName' => 'first name',
            'email' => 'email',
            'password' => 'password',
            'confirmPassword' => 'confirm password'
        );
        $v->setAttributeNames($attributeNames);

        // Was the validation successful?
        if ($v->fails())
            return Redirect::to('/users/edit/' . $id)
                ->withErrors($v)
                ->withInput();

        $user = User::find($id);
        $user->full_name = Input::get('firstName');
        $user->email = Input::get('email');
        // save user
        $logged_in_user = Auth::id();
        if ($user->save()) {

            /* Resetting password linux user */
            $password = Input::get('password');
            if (strlen(trim($password)) > 3) {
                // TODO: Change password
            }
            $date = new \DateTime;
            //if success, add role to the user only if logged in user has admin access
            if (Session::get('is_admin') == 'yes') {
                $role_id = Input::get('role');
                if ($role_id > 0) {
                    $user->roles()->detach();
                    $user->roles()->attach($role_id, array('created_by' => $logged_in_user, 'created_at' => $date, 'updated_at' => $date));
                } else {
                    $user->roles()->detach();
                }
                $user->save();
            }
        }

        return Redirect::to('users')
            ->with('message', 'User added!');
    }

    public function add() {
        $rolesListsDB = Role::get();
        $roleList = array();
        $roleList[''] = '-Select a role-';
        foreach ($rolesListsDB as $roleListDB) {
            $roleList[$roleListDB->id] = $roleListDB->role_name;
        }
        $dataToView['roleList'] = $roleList;
        $this->layout->content = View::make('users.userform', $dataToView);
    }

    public function edit($id = NULL) {
        //check if logged in user has access to edit the page
        $access = $this->checkUserAccess();
        if ($access == false)
            return Redirect::to('users')
                ->with('error', 'Permission denied!');

        $rolesListsDB = Role::get();
        $roleList = array();
        $roleList[''] = '-Select a role-';
        foreach ($rolesListsDB as $roleListDB)
            $roleList[$roleListDB->id] = $roleListDB->role_name;
        $dataToView['roleList'] = $roleList;

        $userDetailDb = User::with('roles')->find($id);

        $dataToView['userDetailDb'] = $userDetailDb;
        $dataToView['userLoginId'] = Auth::id();
        $this->layout->content = View::make('users.userform', $dataToView);
    }

    //GET display collection of users 
    public function index() {
        $userListDB = new User;
        //initializing number of results per page need to change pagelimit to perPage
        $perPage = Input::get('pagelimit');
        $perPage = $perPage > 0 ? $perPage : 50;
        $userList = $userListDB->getUsers($perPage);

        //finally render our template.
        $this->layout->content = View::make('users.user', array('userLists' => $userList, 'perPage' => $perPage, 'datalist' => array()));
        $this->layout->heading = 'Users';
    }

    function removeUser($userId = NULL) {
        //check if logged in user has access to remove user
        $access = $this->checkUserAccess();
        if ($access == false)
            return Redirect::to('users')
                ->with('error', 'Permission denied!');
        $this->layout = '';

        $user = User::find($userId);
        //delete the user and corresponding user group ids and roles
        // TODO: SSH delete
        if ($user->delete()) {
            $user->roles()->detach();
        }
        return Redirect::to('users')
            ->with('message', 'User removed!');
    }

    public function getUserRoleAccess($userid) {
        $user = User::find($userid);
        if (!$user)
            return false;
        $roles = $user->roles;
        if ($roles) {
            $roleIds = $roles->lists('id');
            if (in_array(2, $roleIds) || in_array(3, $roleIds)) {
                return true;
            }
        } else
            return false;
    }

    /*
     * Check if a user has access to a edit a normal user
     *
     */

    function checkUserAccess() {
        $access = false;
        if (Session::get('is_admin') == 'yes')
            $access = true;
        return $access;
    }

    private function sshCreateUser($username, $password) {
        $sshConnection = ssh2_connect(SdmsConfig::value('hostSSH'), 22);
        @ssh2_auth_password($sshConnection, SdmsConfig::value('adminUser'), SdmsConfig::value('adminPwd'));
        $script = "sudo add-sepal-user " . $username . " " . $password . " sepalUsers" . PHP_EOL;
        Logger::debug('Data Script: ', $script);
        $stream = ssh2_exec($sshConnection, $script);
        stream_set_blocking($stream, true);
        $stream_out = ssh2_fetch_stream($stream, SSH2_STREAM_STDIO);
        $uid = stream_get_contents($stream_out);
        return $uid;
    }
}

?>
