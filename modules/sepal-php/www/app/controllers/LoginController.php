<?php

class LoginController extends \BaseController {

    //public function __construct()
    //{

   // }

	protected $layout = 'layouts.login';
	public function create() {}

	public function store(){}

    /**
     * Show the user login.
     */
    public function index()
    {
        $this->layout->content = View::make('logins.login');
    }

    public function check(){



    // Validation rules
        $rules = array(
            'userName' => 'required',
            'password' => 'required',
         );
    
    // Validate the inputs
        $v = Validator::make( Input::all(), $rules );

    // Setting attribute for readable format   
        $attributeNames = array(
            'userName' => 'user name',
            'password' => 'password',
        );
        $v->setAttributeNames($attributeNames);

    // Was the validation successful?
        if ( $v->fails() )
        {
	    // Something went wrong
            return Redirect::to('login')
            ->withErrors($v)
            ->withInput();
            
        }else{
		$user = array(
		'username' => Input::get('userName'),
		'password' => Input::get('password')
		);
		//Check user credentials with pam - system data- linux user

        $sshConnection = ssh2_connect(SdmsConfig::value('hostSSH'), 22);
		//if(!pam_auth($user['username'],$user['password'])){
        $sshAuthConnection=@ssh2_auth_password($sshConnection, $user['username'], $user['password']);

        if($sshAuthConnection===FALSE){
			$message = 'Incorrect username or password!';
			$this->layout->content = View::make('logins.login',array('message'=>$message));
		}else{

			$userAuth = User::where('username', $user['username'])->first();
			if(count($userAuth)>0){
				$userAuth = User::where('username', $user['username'])->first();	
			}else{
			    
			    //Create new user based in the username	
			    $userModel = new User;
			    $userModel->username = $user['username'];
			    $userModel->save();
			    //Get details from database to trigger laravel auth class	
			    $userAuth = User::where('username', $user['username'])->first();
				   
			}

			  //bypassing authentication with username alone instead of password to relate user
			   // $remember = Input::get('remember');
			    //$rememberMe => !empty($remember) ? $remember : null; 
			    Auth::login($userAuth);//Authentication progress
			    Session::put('username',$user['username']);
                Session::put('userkey',$user['password']);


	 		     #todo remove this , just a reference to retrive logged in userid 
			    if (Auth::check())
			    {$id = Auth::id();

                    $statusCheck=UserRole::where('role_id','>=',1)
                        ->where('role_id','<=',2)
                        ->where('user_id','=',$id)
                        ->get();

                        if(isset($statusCheck) && (count($statusCheck)>0)){
                            Session::put('is_admin','yes');
                        }else{
                            Session::put('is_admin','no');
                        }

                        $statusCheck=Usergroup::where('is_group_admin','=',1)
                        ->where('user_id','=',$id)
                        ->get();

                        if(isset($statusCheck) && (count($statusCheck)>0)){
                            $group_id=array();
                            foreach($statusCheck as $checkStatus)
                            {
                                $group_id[]=$checkStatus->group_id;
                            }
                            Session::put('group_admin','yes');
                            Session::put('group_id',$group_id);
                        }


                }

			    return Redirect::to('account');
			    // The user is active, not suspended, and exists.
		}
	} 
    }

    public function logout(){
        if (Auth::check()) 
        {	
            Session::flush();
            Auth::logout();
        }
        return Redirect::to('login');
    }

}
?>
