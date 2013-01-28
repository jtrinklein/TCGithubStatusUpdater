Simple node.js server designed to accept POSTs from Teamcity server running builds from github and update the corresponding commit with a success/failure status.

GitHub
======
* Generate an oauth token for a user that can create statuses for the repos you will be using. [Directions here](https://help.github.com/articles/creating-an-oauth-token-for-command-line-use)
* Verify the repo, repoOwner and oauthToken are correct in your config.json

Teamcity
========
* First make sure you've setup your Teamcity server to use a Git repository from GitHub
* Next make sure tcUser, tcPwd and tcServer entries in your config.json are correct. (The TC user needs to be able to get extra information about the build that ran)
* Add any buildTypeId that you want to use to update the GitHub status to the buildTypesToMonitor array in the config.json.
* Finally add a Webhook for the project you want to monitor with to point to your node.js server.