#!/usr/bin/env node

'use strict';

var http = require("http");
var tmp = require("tmp");
var fs = require("fs");
var spawn = require('child_process').spawn;
var Kaiseki = require('kaiseki');

var contentType = {"Content-Type": "application/json"};
var videoListSuffix = "videos";
var mashUpSuffix = "mashup";

// Kaiseki instance
var PARSE_APP_ID = 'Cflndkv2V6uHwgdVQA5a8SpauDMvxoIk96aRgqKE';
var PARSE_REST_API_KEY = 'zXv53x8AoJjhtmRe2L9qt6bRPsR2WcGG5kLc4qnw';
var kaiseki = new Kaiseki(PARSE_APP_ID, PARSE_REST_API_KEY);

/**
 * Request-handler
 */
http.createServer(function (request, response) {

  // Request received
  if (request.method === "POST") {
    response.writeHead(200, "OK", contentType);
    response.end('Ok', 'utf8');
  }
  else {
    response.writeHead(405, "Method not allowed", contentType);
    response.end('Method not allowed', 'utf8');
  }

  // Create unique temp dir for this request
  tmp.dir(function (err, path) {
    if (err) {
      throw err;
    }

    // Handle request
    readVideosIDs(request, response, function (data) {
      data.path = path;
      downloadVideos(data, function () {
        mashUpVideos(data, function () {
          uploadMashUp(data);
        });
      });
    });
  });

}).listen(6862);

console.log("Listening on http://mash.romac.me:6862");

/**
 * Read videos IDs from the POST-data from request and handle related errors
 */
function readVideosIDs(request, response, callback) {
  var maxSize = Math.pow(2, 20);
  var data = "";

  // Read as much data as possible and concat
  request.on("data", function (partialData) {
    data += partialData;
    if (data.length > maxSize) {
      data = "";
      request.connection.destroy();
    }
  });

  // Once all data is read, give to callback
  request.on("end", function () {
    callback(JSON.parse(data));
  });
}


/**
 * DOWNLOAD ALL THE THINGS!  \•/
 */
function downloadVideos(data, callback) {
  var downloaded = [];

  // Shuffle the videos, we don't want to always have the same machup
  data.videos = suffle(data.videos);

  data.videos.each(function (video) {
    var videoLocalFile = data.path + "/" + video.objectId;

    // Write file name for ffmpeg later
    fs.appendFile(data.path + "/" + videoListSuffix,
      "file '" + videoLocalFile + "'", function (err) {
        if (err) {
          throw err;
        }
      });

    // Download videos
    var request = http.get(video.file.url, function (response) {
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
  var prog = "ffmpeg";
  var args = [
    "-f", "concat",
    "-i", data.path + "/" + videoListSuffix,
    "-c", "copy",
    data.path + "/" + mashUpSuffix
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
  kaiseki.uploadFile(data.path + "/" + mashUpSuffix,
    function(err, res, body, success) {

      // Give mashup url to Parse.com
      var mashUp = {
        group: data.group.objectId,
        file: {
          name: body.name,
          __type: 'File'
        }
      };
      kaiseki.createObject("Mashup", mashUp,
        function(err, res, body, success) {
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
