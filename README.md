Simple node.js server designed to accept POSTs from Teamcity server running builds from github and update the corresponding commit with a success/failure status.

This server also uses the MasterStatusServer to keep a monitor of master builds for a repo. If any of these builds are `RED` the status of a commit for that repo will be red as well.


GitHub Setup
======
* Generate an oauth token for a user that can create statuses for the repos you will be using. [Directions here](https://help.github.com/articles/creating-an-oauth-token-for-command-line-use)
* Verify the oauthToken is correct in your config.json

Teamcity Setup
========
* First make sure you've setup your Teamcity server to use a Git repository from GitHub
* In cases where a build uses multiple vcs roots, the first vcs root should be for the repository to have the status updated.
* Next make sure tcUser, tcPwd and tcServer entries in your config.json are correct. (The TC user needs to be able to get extra information about the build that ran)
* Finally add a Webhook for the project you want to monitor with to point to your node.js server.
 
Endpoints
=========
* /gitstatus/init - used to create a `pending` status for a commit, only sets `pending` status if no commit status exists yet.
* /gitstatus/update - updates the status of a commit with `success` or `failure` based on the build status.
