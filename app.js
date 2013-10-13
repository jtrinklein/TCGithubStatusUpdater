
/**
 * Module dependencies.
 */

var express = require('express'),
  https = require('https'),
  http = require('http'),
  config = require('./config.json');

var githubStatus = {success: 'success', failure: 'failure', pending: 'pending'};
var app = module.exports = express.createServer();

// Configuration
app.configure(function(){
  app.use(express.bodyParser());
  app.use(express.methodOverride());
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

////////////// Utility functions ///////////////
function log(buildId, message) {
  var date = new Date();

  console.log(date.getDate() + '/' + date.getMonth() + 
		  ' ' + date.getHours() + ':' + date.getMinutes() + '.' + date.getSeconds() + 
		  ' [' + buildId + '] ' + message);
}

function contains(arr, val) {
  return (arr.indexOf(val) != -1);
}

function buildGithubStatusRequestOptions(repo, commitHash, method, dataOrNull) {
  var data = dataOrNull || '';

  var urlHost = 'api.github.com';
  var urlPath = '/repos/' + repo + '/statuses/' + commitHash;
  var authHeader = 'token ' + config.oauthToken;
  
  var options = {
    host : urlHost,
    port : 443,
    path : urlPath,
    method : method,
    headers : {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    }
  };
  if(data.length > 0) {
	  options.headers['Content-Length'] = data.length;
  }
  return options;
}
////////////////////////////////////////////////
function updateCommitStatus(buildId, repo, commitHash, status, buildUrl, msg) {
  var repoString = repo + ' ' + commitHash;
  var message = msg || '';
  var state = status.toLowerCase();
  var data = '{ "state":"' + state + '", "target_url":"' + buildUrl + '", "description":"' + message + '"}';

  var options = buildGithubStatusRequestOptions(repo, commitHash, 'POST', data);
  log(buildId, 'sending status update: ' + repoString + ' -> \n' + data);
  var request = https.request(options,function(response){  
    var body = '';
    response.setEncoding('utf8'); 
    response.on('error', function(e) {
      log(buildId, 'failed to set commit status.');
      log(buildId, e.message);
    });
	response.on('data', function(chunk){ body += chunk; });
    response.on('end', function() {
      log(buildId, 'sent status update: ' + repoString + ' -> ' + state);
    });
  });
  request.write(data);
  request.end();
}

function getCommitStatus(repo, commit, onSuccess, onError) {
  var repoString = repo + ' ' + commit;
  var options = buildGithubStatusRequestOptions(repo, commit, 'GET');
  var request = https.request(options,function(response){  
    var body = '';
    response.setEncoding('utf8'); 
    response.on('error', function(e) {
      log('getStatus', 'failed to set commit status.');
      log('getStatus', e.message);
	  if(onError && typeof onError === 'function') {
        onError(e);
	  }
    });
	response.on('data', function(chunk){ body += chunk; });
    response.on('end', function() {
	  if(onSuccess && typeof onSuccess === 'function') {
        onSuccess(JSON.parse(body));
      }
    });
  });
  request.end();
}

// callback is function with signature function([String] commitId, [Bool] status, [String] webUrl)
// error is function with signature function([Exception]exception)
function getBuildStatus(buildId, callback, error) {
  var options = {
    host : config.tcServer,
    path : '/app/rest/builds/id:' + buildId,
    method : 'GET',
    headers : {
      'Authorization': 'Basic '+new Buffer(config.tcUser + ':' + config.tcPwd).toString('base64'),
	  'Accept' : 'application/json'
    }
  };
  var request = http.request(options,function(response){   
    var body = '';
    response.on('error', function(e) {
      log(buildId, "failed to get build info");
      log(buildId, e.message);
    });
    response.on('data', function(chunk){ body += chunk; });
    response.on('end', function(){
	  var build = JSON.parse(body);
     
      if(callback && typeof callback === 'function') {
		  callback(build);
      }
    });
  });
  request.end();
}

function checkMasterStatus(repo, onGreen, onRed, error) {
  console.log('checking master status...');
  var options = {
    host : config.masterStatusServer,
    port : config.masterStatusServerPort,
    path : '/repo/'+ repo.split('/')[1] + '/status',
    method : 'GET'
  };
  var request = http.request(options,function(response){
    var status = '';
    response.on('error', function(e) {
      if(error && typeof error === 'function') {
         error(e);
      }
      log('checkMasterStatus','failed to get Master builds status');
      log('checkMasterStatus',e.message);
    });
    response.on('data',function(chunk){ status += chunk; });
    response.on('end', function(){
      log('checkMasterStatus','Master Builds Status: ' + status);
      if(status === 'RED' && onRed && typeof onRed === 'function'){
        onRed();
      }
     if(status === 'GREEN' && onGreen && typeof onGreen === 'function'){
        onGreen();
      }
    });
  });

  request.end();
}

function getRepositoryUrl(vcsId, callback) {
  var options = {
    host : config.tcServer,
    path : '/app/rest/vcs-roots/' + vcsId + '/properties/url',
    method : 'GET',
    headers : {
      'Authorization': 'Basic '+new Buffer(config.tcUser + ':' + config.tcPwd).toString('base64')
    }
  };
  var request = http.request(options,function(response){   
    var body = '';
    response.on('error', function(e) {
      log(buildId, "failed to get vcs root info vcsId: " + vcsId);
      log(buildId, e.message);
    });
    response.on('data', function(chunk){ body += chunk; });
    response.on('end', function(){
     
      if(callback && typeof callback === 'function') {
		  callback(body);
      }
    });
  });
  request.end();
}

// Routes

app.post('/gitstatus/init',function(req,res) {
	var buildId = req.body.build.buildId;
	var url = req.body.build.buildStatusUrl;
	res.send('ok');
	res.end();
	setTimeout(function(){
		getBuildStatus(buildId,function(buildStatus) {
			var branch = buildStatus.branchName;
			var commit = buildStatus.revisions.revision[0].version;
			var vcsId = buildStatus.revisions.revision[0]['vcs-root-instance']['vcs-root-id'];
			getRepositoryUrl(vcsId, function(repoUrl) {
				var repo = repoUrl.split(':')[1].split('.')[0];
				getCommitStatus(repo,commit,function(status){
					if(status.length === 0) {
						updateCommitStatus(buildId,repo,commit,'pending',url,'test run in progress');
					}
				});
			});
		});
	},10000);
});

app.post('/gitstatus/update', function(req,res) {
	var date = new Date();
	var buildId = req.body.build.buildId;
    var statusText = req.body.build.buildFullName + ' - ' + req.body.build.buildStatus + ' - ' + date.toDateString();
	var url = req.body.build.buildStatusUrl;
    log(buildId, statusText);

	getBuildStatus(buildId,function(buildStatus) {
		var branch = buildStatus.branchName;
		var status = buildStatus.status.toLowerCase();
		var commit = buildStatus.revisions.revision[0].version;
		var vcsId = buildStatus.revisions.revision[0]['vcs-root-instance']['vcs-root-id'];
		
		getRepositoryUrl(vcsId, function(repoUrl) {
			var repo = repoUrl.split(':')[1].split('.')[0];
			checkMasterStatus(repo,function(){
				updateCommitStatus(buildId,repo,commit,status,url,statusText);
			},function(){
				updateCommitStatus(buildId,repo,commit,'failure',url,'Cannot pull when master is red!');
			});
		});
	});
	res.send('ok');
	res.end();
});


app.listen(config.appPort);
console.log("TC GitHub Status Updater listening on port %d in %s mode", app.address().port, app.settings.env);
