![banner](https://raw.githubusercontent.com/openforis/sepal-doc/master/docs/source/_images/sepal_header.png)

SEPAL
=====
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/openforis/sepal/blob/master/license.txt)
[![Documentation Status](https://readthedocs.org/projects/sepal-doc/badge/?version=latest)](https://sepal-doc.readthedocs.io/en/latest/?badge=latest) 
[![Crowdin](https://badges.crowdin.net/sepal/localized.svg)](https://crowdin.com/project/sepal)

SEPAL is a cloud computing platform for geographical data processing. It enables users to quickly process large amount
of data without coding, high network bandwidth requirements or need to invest in high-performance computing infrastructure.

--------------------------------------------------------------------------------

Currently available in the following languages:

| English | Français | Español |
|---------|----------|---------|

You can contribute to the translation effort on our [crowdin project](https://crowdin.com/project/sepal).

--------------------------------------------------------------------------------

Background
----------
FAO and Norway are collaborating on the System for Earth Observation Data Access, Processing and Analysis for Land Monitoring (SEPAL).

It  consists of the following components:

1. A powerful, cloud-based computing platform for big data processing and storage.
2. Facilitated access to remote sensing data sources through a direct-access-interface to earth observation data
   repositories.
3. A set of open-source software tools, capable of efficient data processing
4. Related capacity development and technology transfer activities

The computing platform enables FAO national partners to process data quickly without locally maintained high
performance computing infrastructures.  The direct link to data repositories allows fast access to satellite
imagery and other earth observation data for processing.  The software tools, such as FAO’s
[Open Foris Geospatial Toolkit](http://www.openforis.org/tools/geospatial-toolkit.html)
perform powerful image processing, are completely customizable and function similarly ‘on the cloud’ or on the desktop.

Resources
----------
SEPAL Documentation - https://docs.sepal.io  
SEPAL 'In Action' - https://www.fao.org/in-action/sepal/  
SEPAL FAO Publications - https://www.fao.org/in-action/sepal/resources/publications/  
SEPAL Online Course - https://www.fao.org/in-action/sepal/certified-course/


Screenshots
-----------
![01 landing](https://user-images.githubusercontent.com/149204/132474862-daf724e5-e7f8-4086-9132-c9afde0e6173.png)
![02 login](https://user-images.githubusercontent.com/149204/132474870-be73899f-f6bb-4d8b-96c5-05bb21a5d53c.png)
![03 recipe list](https://user-images.githubusercontent.com/149204/132474880-12333a36-dee0-4bdc-a0b4-0e9aab24b601.png)
![03 create recipe](https://user-images.githubusercontent.com/149204/132481048-6149f776-a7ed-47cb-8f75-3519aa1b8f1e.png)
![04 optical](https://user-images.githubusercontent.com/149204/132482428-16ef1555-26bc-441a-8717-d65db3b62ef4.png)
![05 nicfi planet composite](https://user-images.githubusercontent.com/149204/132474895-da433549-5d52-48cf-93ae-23c0ee9d47c0.png)
![06 sentinel1 time scan](https://user-images.githubusercontent.com/149204/132483174-154e792e-b6ce-4b22-ad08-1b8e4fdda829.png)
![07 sentinel1 harmonics](https://user-images.githubusercontent.com/149204/132474903-0d1db533-7427-49f6-9981-07aa5a0f6b71.png)
![08 classification](https://user-images.githubusercontent.com/149204/132474907-d4a018a1-282f-4dbd-b870-90bae470d1a0.png)
![09 ccdc chart](https://user-images.githubusercontent.com/149204/132474909-3a3c9f9d-4fb9-42b8-be01-2b354c7283a3.png)
![10 visparams](https://user-images.githubusercontent.com/149204/132474911-13fdd36a-e4fd-4ad2-93e2-e0a53510b1dc.png)
![11 layers layout](https://user-images.githubusercontent.com/149204/132478296-627a62cd-9d7b-40cf-a1aa-034c50664cf6.png)
![12 iPhone](https://user-images.githubusercontent.com/149204/132478926-2bf51235-de16-4a11-9bfb-4960b1e5471a.png)
![13 terminal](https://user-images.githubusercontent.com/149204/132491822-db82fe79-154f-4f60-b0bc-b5a57006c5a4.png)
![14 apps](https://user-images.githubusercontent.com/149204/132491851-5ac0303f-1064-4e12-9627-f34e3f78d880.png)

Architectural overview
----------------------
The core of the system is the _SEPAL server_ and the _user sandboxes_. SEPAL server provides a web-based user-interface,
where geospatial data from multiple providers can be searched, processing chains composed and executed, and geospatial
data products visualized.

The user sandboxes are spaces where users get access to a number of geospatial data processing tools, such as those
included in Open Foris Geospatial Toolkit and Orfeo Toolbox, and their own dedicated storage. SEPAL provides users SSH
access to their respective sandbox. This can either be done directly with an SSH client, or through a provided web-based
terminal. Web-based sandbox tools can be accessed over HTTP.

Sandboxes are implemented as Docker containers, which in addition to providing isolation between users, allows for very
flexible deployment. Sandboxes are started when needed, and stopped when not used. This enables them to be deployed in a
cluster of worker server instances, which can be dynamically scaled up and down based on demand.

### Default AWS deployment
There are three types of server instances:

1. SEPAL servers, constantly running, one in each region where SEPAL is deployed. In addition to the features
   described above, they also are the entry points for user sandboxes. These instances can be
   fairly small and cheap, and don’t require much storage.

2. Worker instances, running user sandboxes and retrieving data (Landsat, Sentinel etc.). These instances are
   automatically launched when users access their sandboxes, and terminated when users disconnect. Users get to decide
   which instance type each sandbox session will be running on.

3. Operation server, one single instance. It tests and deploys the software, monitors the health of the system,
   and provides a user interface where user usage can be monitored, and disk/instance use quotas can be configured.
   This instance can be fairly small.

Users can at times require a lot of processing power and memory for their processing jobs. The large instances
needed for this type of jobs are quite expensive. For instance, an r3.8xlarge (32 CPUs, 244 GiB memory) costs over 3 USD
an hour, which adds up to more than 2,300 USD a month. When using such expensive instances, care have to be taken to
use them efficiently, and not have them sitting idle at any time. To maximize the utility of the worker instances,
SEPAL will automatically launch them when they are requested, and terminate them when they're not used anymore.
For instance, if a user run a 10 hours processing job on an r3.8xlarge, the total cost would be 30 USD, with no
money spent on an idling instance.

To limit the cost of operating SEPAL, each user has a configurable monthly budget to spend on sandbox sessions. For
instance, given a monthly budget of 100 USD a user might have used 32 hours of r3.8xlarge, or 250 hours r3.large and 450
hours t2.large.

Another costly component is storage, where 1TB of EFS storage costs 300 USD a month. To limit storage costs, each user
have configurable disk quota.

### Components and services part of a SEPAL deployment

**HAProxy** -
Off-the-shelf load balancer, allowing SEPAL to be clustered for availability. Run both SSH and HTTPS on port 443,
to prevent firewalls from blocking SSH.

**nginx** -
Off-the-shelf HTTP and reverse proxy server, proxying all SEPAL HTTP endpoints.

**Xterm.js** -
Off-the-shelf web-based SSH client. Gives  users SSH access to their Sandbox in a web browser.

**Sepal server** -
Provides the system user interface.

**Data provider** -
Service retrieving geospatial data from various external data providers.

**Sandbox lifecycle manager** -
Service managing the user sandboxes. It deploys them on demand when users requests access, and un-deploys them as soon
as a user disconnects from them.

**Sandbox SSH gateway** -
Service responsible for dynamically tunnelling SSH connections to users sandbox, while notifying the sandbox lifecycle
manager on connects and disconnects.

**Sandbox web proxy** -
Service proxying HTTP connections to user sandboxes. It maintains HTTP sessions, and notifies the sandbox lifecycle
manager on session creation and expiry.

**Sandbox** -
The user sandboxes are spaces where users get access to a number of geospatial data processing tools. See table below
for provided tools.

![SEPAL components](https://raw.githubusercontent.com/openforis/sepal/master/docs/Components.png)

### Software deployed on each users sandbox:

**Open Foris Geospatial Toolkit** -
A collection of command-line utilities for processing of geospatial data.

**GDAL** -
A translator library for raster and vector geospatial data formats.

**R** -
Language for statistical computing and graphics.

**RStudio Server** -
An IDE for R in a web browser.

**Orfeo ToolBox** -
Library for remote sensing image processing.

**OpenSARKit** -
Tools for Automatic Preprocessing of SAR Imagery.

Build and Release
-----------------
The project is under active development, and the build and release process is still in flux, so these
instructions will change, and improve, over time.

### Prerequisites
In order to build and run the SEPAL system, a Linux or macOS installation is needed.
The end-users on the other hand, are of course free to use whatever Operating system they prefer, including Windows.

In addition to this, the following software must be installed:

[Java](http://www.oracle.com/technetwork/java/javase/downloads/index.html),
[Maven](https://maven.apache.org/download.cgi), and
[Ansible](http://docs.ansible.com/ansible/intro_installation.html).
If you want to run the system locally, you need [Vagrant](https://www.vagrantup.com/downloads.html), and
to deploy on Amazon Web Services EC2 instances, you need an [AWS account](https://aws.amazon.com/account/).

### Configuration
TBD

### Build
TBD

### Deploy
TBD
