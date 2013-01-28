
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
function updateCommitStatus(buildId, commitHash, success, buildUrl) {
  var state = success ? 'success' : 'failure';
  var data = '{ "state":"' + state + '", "target_url":"' + buildUrl + '"}';
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

// Routes

app.post('/gitstatusupdater', function (req,res) {
  var currTime = new Date() + ' -> ';
  var buildId = req.body.build.buildId
  
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
      
      if(contains(config.buildTypesToMonitor, buildTypeId)) {
        var commitHash = body.substr(shaIdx, 40); // sha hashes are 40 characters long
        var success = body.substr(statusIdx, statusEndIdx - statusIdx) == 'SUCCESS';
        var webUrl = body.substr(urlIdx, urlEndIdx - urlIdx);
        
        log(buildId, 'found commit hash: ' + commitHash);
        
        updateCommitStatus(buildId, commitHash, success, webUrl);
      }
      else {
        log(buildId, 'ignored build type id: ' + buildTypeId);
      }
    });
  });
  request.end();
});

app.listen(config.appPort);
console.log("TC GitHub Status Updater listening on port %d in %s mode", app.address().port, app.settings.env);
