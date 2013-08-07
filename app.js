
/**
 * Module dependencies.
 */

var express = require('express'),
  https = require('https'),
  http = require('http'),
  config = require('./config.json');

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
  console.log('[' + buildId + '] ' + message);
}

function contains(arr, val) {
  return (arr.indexOf(val) != -1);
}

////////////////////////////////////////////////
function updateCommitStatus(buildId, commitHash, success, buildUrl, msg) {
  var message = msg || '';
  var state = success ? 'success' : 'failure';
  var data = '{ "state":"' + state + '", "target_url":"' + buildUrl + '", "description":"Status set by TeamCity Github Status Updater\n\n' + message + '"}';

  var urlHost = 'api.github.com';
  var urlPath = '/repos/' + config.repoOwner + '/' + config.repo + '/statuses/' + commitHash;
  var authHeader = 'token ' + config.oauthToken;
  
  var options = {
    host : urlHost,
    port : 443,
    path : urlPath,
    method : 'POST',
    headers : {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  log(buildId, 'sending status update...');
  var request = https.request(options,function(response){   
    response.setEncoding('utf8'); 
    response.on('error', function(e) {
      log(buildId, 'failed to set commit status.');
      log(buildId, e.message);
    });
    response.on('end', function() {
      log(buildId, 'sent status update: ' + commitHash + ' -> ' + state);
    });
  });
  request.write(data);
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
      'Authorization': 'Basic '+new Buffer(config.tcUser + ':' + config.tcPwd).toString('base64')
    }
  };
  var request = http.request(options,function(response){   
    var body = '';
    response.on('error', function(e) {
	  if(error && typeof error === 'function') {
	     error(e);
	  }
      log(buildId, "failed to get build info");
      log(buildId, e.message);
    });
    response.on('data', function(chunk){ body += chunk; });
    response.on('end', function(){
      var versionSearchString = '<revision version="';
      var statusSearchString = 'status="';
      var urlSearchString = 'webUrl="';
      var buildTypeSearchString = 'buildTypeId=';
     
      var shaIdx = body.indexOf(versionSearchString) + versionSearchString.length;
      var statusIdx = body.indexOf(statusSearchString) + statusSearchString.length;
      var statusEndIdx = body.indexOf('"', statusIdx);
      var urlIdx = body.indexOf(urlSearchString) + urlSearchString.length;
      var urlEndIdx = body.indexOf('"', urlIdx);
      var btIdx = body.indexOf(buildTypeSearchString) + buildTypeSearchString.length;
      var btEndIdx = body.indexOf('"', btIdx);
     
      var buildTypeId = body.substr(btIdx, btEndIdx - btIdx);
     
      var commitHash = body.substr(shaIdx, 40); // sha hashes are 40 characters long
      var success = body.substr(statusIdx, statusEndIdx - statusIdx) == 'SUCCESS';
      var webUrl = body.substr(urlIdx, urlEndIdx - urlIdx);
     
      log(buildId, 'found commit hash: ' + commitHash);
     
      if(callback && typeof callback === 'function') {
        callback(commitHash, success, webUrl);
      }
    });
  });
  request.end();
}

function checkMasterBuildsStatus(onGreen, onRed, error) {
  console.log('checking...');
  var options = {
    host : config.masterStatusServer,
    port : config.masterStatusServerPort,
    path : '/status',
    method : 'GET'
  };
  var request = http.request(options,function(response){
    var status = '';
    response.on('error', function(e) {
      if(error && typeof error === 'function') {
         error(e);
      }
      log('checkMasterBuildsStatus','failed to get Master builds status');
      log('checkMasterBuildsStatus',e.message);
    });
    response.on('data',function(chunk){ status += chunk; });
    response.on('end', function(){
      log('checkMasterBuildsStatus','Master Builds Status: ' + status);
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
// Routes

app.post('/gitstatusupdater', function (request,response) {
  var currTime = new Date() + ' -> ';
  var buildId = request.body.build.buildId;
  
  getBuildStatus(buildId, function(commit, success, url) {

    if(!success) {
      updateCommitStatus(buildId, commit, success, url);
      response.send('Build Failure');
      response.end();
    }
    else {
      checkMasterBuildsStatus(function() {
        
        updateCommitStatus(buildId, commit, success, url);

        response.send('Build Passed!');
        response.end();
      },function(){
        
        var msg = 'Cannot merge when Master builds are red!';
        updateCommitStatus(buildId, commit, false, url, msg);
        
        response.send(msg);
        response.end();
      });
    }
  });
  
});

app.listen(config.appPort);
console.log("TC GitHub Status Updater listening on port %d in %s mode", app.address().port, app.settings.env);
