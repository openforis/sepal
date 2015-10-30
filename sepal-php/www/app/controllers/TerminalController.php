<?php

Class TerminalController extends \BaseController{
     //uses layout views/layouts/sdmsdashboard.blade.phhp
    protected $layout = 'layouts.master';
    //show Terminal page 
    public function showTerminal(){

         $this->layout->content = View::make('terminal.terminal');
    }
}
