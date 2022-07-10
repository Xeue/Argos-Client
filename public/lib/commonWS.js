/*jshint esversion: 6 */

var connecting = 0;
var conn;
var connCount = 0;
var connNum = 1;
var currentCon;
var connectLoop;
var forceShut = 0;
var version = "1.0";
let loadTime = new Date().getTime();
let myID;
let type;

$("main").addClass("disconnected");

function socketConnect(inputType) {
  type = inputType;
  myID = `${type.charAt(0)}_${loadTime}_${version}`;
  if (connecting == 0) {
    connecting = 1;
    if (connCount > 0) {
      connNum++;
      if (connNum > servers.length) {
        connNum -= servers.length;
      }
      connCount = 0;
    }
    connCount++;
    console.log("Connecting to: wss://"+servers[connNum-1]);
    currentCon = servers[connNum-1];
    conn = new WebSocket('wss://'+servers[connNum-1]);

    conn.onopen = function(e) {
      console.log("Connection established!");
      connecting = 0;
      connCount = 0;
      $("main").removeClass("disconnected");
      if (typeof socketDoOpen == "function") {
        socketDoOpen(e);
      }
    };

    conn.onmessage = function(e) {
      let packet = JSON.parse(e.data);
      let header = packet.header;
      let payload = packet.payload;
      if (typeof socketDoMessage == "function") {
        socketDoMessage(packet, header, payload, e);
      }
      switch (payload.command) {
        case "ping":
          conn.pong();
          break;
      }
    };

    conn.onclose = function(e) {
      if (forceShut == 0) {
        console.log('Connection failed');
        setTimeout(function(){socketConnect(inputType);}, 500);
      }
      connecting = 0;
      forceShut = 0;
      $("main").addClass("disconnected");
      if (typeof socketDoClose == "function") {
        socketDoClose(e);
      }
    };

    conn.tally = function(id, status) {
      id = id || 0;
      let main = {};
      main[id] = {};
      main[id][status] = true;
      let payload = {
        "command":"tally",
        "busses":{
          "main":main
        }
      };
      sendData(payload);
      if (typeof socketDoTally == "function") {
        socketDoTally(e);
      }
    };

    conn.untally = function(id, status) {
      id = id || 0;
      let main = {};
      main[id] = {};
      main[id][status] = false;
      let payload = {
        "command":"tally",
        "busses":{
          "main":main
        }
      };
      sendData(payload);
      if (typeof socketDoUnTally == "function") {
        socketDoUnTally(e);
      }
    };

    conn.pong = function() {
      let payload = {"command":"pong"};
      sendData(payload);
      if (typeof socketDoPong == "function") {
        socketDoPong(e);
      }
    };
  }
}

function makeHeader() {
  let header = {};
  header.fromID = myID;
  header.timestamp = new Date().getTime();
  header.version = version;
  header.type = type;
  header.system = currentSystem;
  if (connecting == 0) {
    header.active = true;
  } else {
    header.active = false;
  }
  header.messageID = header.timestamp;
  return header;
}

function sendData(payload) {
  let packet = {};
  let header = makeHeader();
  packet.header = header;
  packet.payload = payload;
  conn.send(JSON.stringify(packet));
}
