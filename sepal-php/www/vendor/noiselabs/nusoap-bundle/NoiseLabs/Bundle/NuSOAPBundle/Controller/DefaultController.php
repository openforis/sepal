<?php

namespace NoiseLabs\Bundle\NuSOAPBundle\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\Controller;

class DefaultController extends Controller
{
    public function indexAction($name)
    {
        return $this->render('NoiseLabsNuSOAPBundle:Default:index.html.twig', array('name' => $name));
    }
}
