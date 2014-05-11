
'use strict';

var http = require('http');
var tmp = require('tmp');
var fs = require('fs');
var spawn = require('child_process').spawn;
var Kaiseki = require('kaiseki');

var videoListSuffix = 'videos';
var mashUpSuffix = 'mashup.mov';

// Kaiseki instance
var PARSE_APP_ID = 'Cflndkv2V6uHwgdVQA5a8SpauDMvxoIk96aRgqKE';
var PARSE_REST_API_KEY = 'zXv53x8AoJjhtmRe2L9qt6bRPsR2WcGG5kLc4qnw';
var kaiseki = new Kaiseki(PARSE_APP_ID, PARSE_REST_API_KEY);

var express = require('express'),
    app = express();

var logger = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');

app.use(logger());
app.use(bodyParser());
app.use(methodOverride());

app.post('/', function(req, res) {
  res.json({success: true});

  // Create unique temp dir for this request
  tmp.dir(function (err, path) {
    if (err) {
      throw err;
    }

    var data = req.body;

    console.log(data);

    data.path = path;
    console.log('data', data);
    downloadVideos(data, function () {
      mashUpVideos(data, function () {
        uploadMashUp(data);
      });
    });

  });

});

app.listen(6862);
console.log('Listening on http://mash.romac.me:6862');

/**
 * DOWNLOAD ALL THE THINGS!  \•/
 */
function downloadVideos(data, callback) {
  var downloaded = [];

  // Shuffle the videos, we don't want to always have the same machup
  data.videos = shuffle(data.videos);

  data.videos.forEach(function (video) {
    var videoLocalFile = data.path + '/' + video.objectId;

    // Write file name for ffmpeg later
    fs.appendFile(data.path + '/' + videoListSuffix,
      'file ' + videoLocalFile + '\n', function (err) {
        if (err) {
          throw err;
        }
      });

    console.log('Downloading %s to %s...', video.file.url, videoLocalFile);

    // Download videos
    http.get(video.file.url, function (response) {
      response.pipe(fs.createWriteStream(videoLocalFile));

      // Callback after the last download
      downloaded.push(video.objectId);
      if (downloaded.length === data.videos.length) {
        callback();
      }
    });
  });
}


/**
 * Mash videos together
 */
function mashUpVideos(data, callback) {
  var prog = 'ffmpeg';
  var args = [
    '-f', 'concat',
    '-i', data.path + '/' + videoListSuffix,
    '-f', 'mov',
    '-strict', '-2',
    data.path + '/' + mashUpSuffix
  ];
  spawn(prog, args, { stdio: 'ignore' })
    .on('close', function (code) {
      if (code !== 0) {
        callback();
      }
    });
}


/**
 * Upload mashup
 */
function uploadMashUp(data) {

  // Upload mashup to Parse.com
  kaiseki.uploadFile(data.path + '/' + mashUpSuffix,
    function(err, res, body, success) {

      // Give mashup url to Parse.com
      var mashUp = {
        group: data.group.objectId,
        file: {
          name: body.name,
          __type: 'File'
        }
      };
      console.log(mashUp);
      kaiseki.createObject('Mashup', mashUp,
        function(err, res, body, success) {
          console.log('create file', arguments);
          if (err) {
            throw err;
          }
      });
  });
}


/**
 * Shuffle an array
 * https://stackoverflow.com/a/6274398
 */
function shuffle(array) {
  var counter = array.length, temp, index;

  // While there are elements in the array
  while (counter > 0) {
    // Pick a random index
    index = Math.floor(Math.random() * counter);

    // Decrease counter by 1
    counter--;

    // And swap the last element with it
    temp = array[counter];
    array[counter] = array[index];
    array[index] = temp;
  }

  return array;
}
