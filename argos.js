let asci = [
"                                    __  __                _  _                _               ",
"    /\\                             |  \\/  |              (_)| |              (_)              ",
"   /  \\    _ __  __ _   ___   ___  | \\  / |  ___   _ __   _ | |_  ___   _ __  _  _ __    __ _ ",
"  / /\\ \\  | '__|/ _` | / _ \\ / __| | |\\/| | / _ \\ | '_ \\ | || __|/ _ \\ | '__|| || '_ \\  / _` |",
" / ____ \\ | |  | (_| || (_) |\\__ \\ | |  | || (_) || | | || || |_| (_) || |   | || | | || (_| |",
"/_/    \\_\\|_|   \\__, | \\___/ |___/ |_|  |_| \\___/ |_| |_||_| \\__|\\___/ |_|   |_||_| |_| \\__, |",
"                 __/ |                                                                   __/ |",
"                |___/                                                                   |___/ ",
"                                                                                              "
];

const serverVersion = "2.3.0";
const serverID = new Date().getTime();

const WebSocket = require('ws');
const express = require('express')
const fetch = require('node-fetch')
const axios = require('axios');
const AWS = require('aws-sdk');
const jsdom = require('jsdom');
const https = require('https');
const fs = require('fs');
require('./logs.js')();


let config;
try {
    config = JSON.parse(fs.readFileSync(__dirname + "/config.conf"));
} catch (error) {
    log("There is an error with the config file or it doesn't exist, entering first time setup", "W");
    let port = reader.question("What port shall the server use: ");
    let systemName = reader.question("What is the name of the system: ");
    let warningTemperature = reader.question("What temperature shall alerts be sent at: ");
    let webEnabled = reader.question("Should this system report back to an argos server: ");
    let webEndpoint = reader.question("What is hte url of the argos server: ");
    let textsEnabled = reader.question("Should texts be sent when warnings are triggered: ");
    if (TextEnabled) {
        let awsAccessKeyId = reader.question("AWS access key for texts: ");
        let awsSecretAccessKey = reader.question("AWS Secret access key for texts: ");
        let awsRegion = reader.question("AWS region: ");
    }
    config = {
        "port": port,
        "systemName": systemName,
        "warningTemperature": warningTemperature,
        "webEnabled": webEnabled,
        "webEndpoint": webEndpoint,
        "textsEnabled": textsEnabled
    }
    if (TextEnabled) {
        config.awsAccessKeyId = awsAccessKeyId;
        config.awsSecretAccessKey = awsSecretAccessKey;
        config.awsRegion = awsRegion;
    }
    try {
        fs.writeFileSync(__dirname + '/config.conf', JSON.stringify(config, null, 4));
        log("Config saved to file");
    } catch (error) {
        log("Could not write config file, running with entered details anyway", "E");
    }
}
config.loggingLevel = config.loggingLevel ? config.loggingLevel : "W";
config.port = config.port ? config.port : 3000;
config.systemName = config.systemName ? config.systemName : "Unknown System";
config.warningTemperature = config.warningTemperature ? config.warningTemperature : 30;
config.webEnabled = config.webEnabled ? config.webEnabled : false;
config.webSocketEndpoint = config.webEndpoint;
config.webEndpoint = `https://${config.webEndpoint}/REST`;
config.textsEnabled = config.textsEnabled ? config.textsEnabled : false;
config.awsAccessKeyId = config.awsAccessKeyId;
config.awsSecretAccessKey = config.awsSecretAccessKey;
config.awsRegion = config.awsRegion;
config.devMode = config.devMode ? config.devMode : false;
config.installName = config.installName ? config.installName : "UK Flypack 01";

const logsConfig = {
    "createLogFile": true,
    "logsFileName": "ArgosLogging",
    "configLocation": __dirname,
    "loggingLevel": config.loggingLevel,
    "debugLineNum": true
}
setLogsConf(logsConfig);

let webServer = {
    "connected": false,
    "active": false,
    "attempts": 0,
    "address": config.webSocketEndpoint,
    "socket": null
};

const app = express()

const data = {
    "neighbors": {},
    "fibre":{},
    "phy": {},
    "mac": {},
    "ups": {},
    "devices":{}
}

const pingFrequency = 30;
const lldpFrequency = 30;
const switchStatsFrequency = 30;
const upsFrequency = 30;
const devicesFrequency = 30;
const tempFrequency = minutes(5);

let awsCredentials = new AWS.Credentials(config.awsAccessKeyId, config.awsSecretAccessKey);
if (config.textsEnabled) {
    AWS.config.update({ region: config.awsRegion});
    AWS.config.credentials = awsCredentials;
}


printHeader(asci);
printConfig();

/* Data */


function loadData(file) {
    try {
        let dataRaw = fs.readFileSync(`${__dirname}/data/${file}.json`);
        let data;
        try {
            data = JSON.parse(dataRaw);
            return data;
        } catch (error) {
            logObj(`There is an error with the syntax of the JSON in ${file}.json file`, error, "E");
            return [];
        }
    } catch (error) {
        logObj(`Cloud not read the file ${file}.json, attempting to create new file`, error, "W");
        let fileData = [];
        switch (file) {
            case "Devices":
                fileData[0] = {
                    "name":"Placeholder",
                    "start":1,
                    "end":2,
                    "description":"Placeholder"
                }
                break;
            default:
                fileData[0] = {
                    "Name":"Placeholder",
                    "IP":"0.0.0.0"
                }
                break;
        }
        if (!fs.existsSync(`${__dirname}/data/`)){
            fs.mkdirSync(`${__dirname}/data/`);
        }
        fs.writeFileSync(`${__dirname}/data/${file}.json`, JSON.stringify(fileData, null, 4));
        return fileData;
    }
};
function writeData(file, data) {
    try {
        fs.writeFileSync(`${__dirname}/data/${file}.json`, JSON.stringify(data, undefined, 2));
    } catch (error) {
        logObj(`Cloud not write the file ${file}.json, do we have permission to access the file?`, error, "E");
    }
}

function switches(object) {
    if (typeof object === "undefined") {
        return loadData("Switches");
    } else {
        writeData("Switches", object);
    }
}
function frames(object) {
    if (typeof object === "undefined") {
        return loadData("Frames");
    } else {
        writeData("Frames", object);
    }
}
function ups(object) {
    if (typeof object === "undefined") {
        return loadData("Ups");
    } else {
        writeData("Ups", object);
    }
}
function devices(object) {
    if (typeof object === "undefined") {
        return loadData("Devices");
    } else {
        writeData("Devices", object);
    }
}


/* Express setup & Endpoints */


app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.static('public'))

app.listen(config.port, "0.0.0.0", () => {
    log(`Argos can be accessed at http://localhost:${config.port}`, "C");
})

app.get('/',  (req, res) =>  {
    log("New client connected", "A");
    res.header('Content-type', 'text/html');
    res.render('ui', {
        switches:switches(),
        systemName:config.systemName,
        webSocketEndpoint:config.webSocketEndpoint
    });
});

app.get('/broken', (req, res) => {
    res.send("no");
})

app.get('/fibre', (req, res) => {
    log("Request for fibre data", "D");
    res.send(JSON.stringify(data.fibre));
})

app.get('/ups', (req, res) => {
    log("Request for UPS data", "D");
    res.send(JSON.stringify(data.ups));
})

app.get('/phy', (req, res) => {
    log("Request for PHY/FEC data", "D");
    res.send(JSON.stringify(data.phy));
})

app.get('/mac', (req, res) => {
    log("Request for mac/flap data", "D");
    res.send(JSON.stringify(data.mac));
})

app.get('/devices', (req, res) => {
    log("Request for devices data", "D");
    res.send(JSON.stringify(data.devices))
})

app.get('/getConfig', (req, res) => {
    log("Request for devices config", "D");
    let catagory = req.query.catagory;
    let data;
    switch (catagory) {
        case "switches":
            data = switches();
            break;
        case "frames":
            data = frames();
            break;
        case "ups":
            data = ups();
            break;
        case "devices":
            data = devices();
            break;
        default:
            break;
    }
    res.send(JSON.stringify(data))
})

app.post('/setswitches', (req, res) => {
    log("Request to set switches config data", "D");
    switches(req.body)
    res.send("Done");
})
app.post('/setdevices', (req, res) => {
    log("Request to set devices config data", "D");
    devices(req.body)
    res.send("Done");
})
app.post('/setups', (req, res) => {
    log("Request to set ups config data", "D");
    ups(req.body)
    res.send("Done");
})
app.post('/setframes', (req, res) => {
    log("Request to set frames config data", "D");
    frames(req.body)
    res.send("Done");
})


/* Request definitions */


const fibreRequest = {
    "jsonrpc": "2.0",
    "method": "runCmds",
    "params": {
        "format": "json",
        "timestamps": false,
        "autoComplete": false,
        "expandAliases": false,
        "cmds": [
            "show interfaces transceiver"
        ],
        "version": 1
    },
    "id": "EapiExplorer-1"
}
const lldpRequest = {
    "jsonrpc": "2.0",
    "method": "runCmds",
    "params": {
        "format": "json",
        "timestamps": false,
        "autoComplete": false,
        "expandAliases": false,
        "cmds": [
            "enable",
            "show lldp neighbors"
        ],
        "version": 1
    },
    "id": ""
}
const macRequest = {
    "jsonrpc": "2.0",
    "method": "runCmds",
    "params": {
        "format": "text",
        "timestamps": false,
        "autoComplete": false,
        "expandAliases": false,
        "cmds": [
            "enable",
            "show interfaces mac"
        ],
        "version": 1
    },
    "id": ""
}
const phyRequest = {
    "jsonrpc": "2.0",
    "method": "runCmds",
    "params": {
        "format": "json",
        "timestamps": false,
        "autoComplete": false,
        "expandAliases": false,
        "cmds": [
            "enable",
            "show interfaces phy detail"
        ],
        "version": 1
    },
    "id": ""
}


/* Switch poll functions */


function lldpLoop() {
    let Switches = switches();
    log("Getting LLDP neighbors", "A");
    let promisses = [];
    for (var i = 0; i < Switches.length; i++) {
      let Switch = Switches[i];
      promisses.push(doApi(lldpRequest, Switch.IP));
    }
    return Promise.all(promisses).then((values) => {
      for (var i = 0; i < values.length; i++) {
        if (typeof values[i] !== "undefined") {
            let neighbors = values[i].result[1].lldpNeighbors;
            data.neighbors[Switches[i].Name] = {};
            let thisSwitch = data.neighbors[Switches[i].Name];
            for (let j in neighbors) {
              let t = neighbors[j];
              if (!t.port.includes("Ma")) {
                thisSwitch[t.port] = { lldp: t.neighborDevice };
              }
            }
        } else {
            log("Return data from switch empty, is the switch online?", "W");
        }
      }
      sendData({"command":"log", "type":"lldp", "data":data.neighbors});
    });
}

function switchMac() {
    let Switches = switches();
    log("Checking for recent interface dropouts", "A");
    function processSwitchMac(response, devices) {
        let keys = Object.keys(devices)
        let split = response.result[1].output.split('\n')
        let macs = []
        for (let i = 8; i < split.length; i++) {
            let t = split[i]
            let mac = {
                int: t.substr(0, 19).trim(),
                config: t.substr(19, 7).trim(),
                oper: t.substr(26, 9).trim(),
                phy: t.substr(34, 16).trim(),
                mac: t.substr(50, 6).trim(),
                last: t.substr(54, t.length).trim()
            }
    
            if (mac.config == "Up") {
                if (!keys.includes(mac.int)) {
                    devices[mac.int] = {}
                }
                devices[mac.int].mac = {}
                devices[mac.int].mac.operState = mac.oper
                devices[mac.int].mac.phyState = mac.phy
                devices[mac.int].mac.macFault = mac.mac
                devices[mac.int].mac.lastChange = mac.last
                devices[mac.int].description = getDescription(devices[mac.int].lldp);
                devices[mac.int].port = mac.int
            }
        }
        return devices;
    }

    let promisses = [];
    for (var i = 0; i < Switches.length; i++) {
      promisses.push(doApi(macRequest, Switches[i].IP));
    }
    return Promise.all(promisses).then((values) => {
        let filteredDevices = [];
        for (var i = 0; i < values.length; i++) {
            if (typeof values[i] !== "undefined") {
                let procDev = clearEmpties(processSwitchMac(values[i], data.neighbors[Switches[i].Name]));
                
                for (let dev in procDev) {
                    if (typeof procDev[dev].mac !== "undefined") {
                        if(!('lastChange' in procDev[dev].mac)) {
                            log(procDev[dev]+" seems to have an issue","W");
                        }
                        let time = procDev[dev].mac.lastChange.split(":")
                        let timeTotal = parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2])
                        if (timeTotal < 300) {
                            procDev[dev].switch = Switches[i].Name;
                            filteredDevices.push(procDev[dev])
                        }
                    }
                }

            } else {
                log("Return data from switch empty, is the switch online?", "W");
            }
        }
        data.mac = filteredDevices;
        sendData({"command":"log", "type":"mac", "data":data.mac});
    });
}

function switchPhy() {
    let Switches = switches();
    log("Looking for high numbers of PHY/FEC errors", "A");
    function processSwitchPhy(response, devices) {
        let phy = response.result[1].interfacePhyStatuses
        let keys = Object.keys(devices)
        for (let i in phy) {
            if (!keys.includes(i)) {
                devices[i] = {}
            }
            let t = phy[i];
            log(t.phyStatuses[0].fec.uncorrectedCodewords);
            let split = t.phyStatuses[0].text.replace(/\s\s+/g, ' ').split(' ');
            if (split.includes("25Gbps")) {
                let j = split.indexOf("uncorrected")
                if (j > -1 && split[j + 6] !== "never") {
                    devices[i].phy = {}
                    devices[i].phy.current = split[j + 4]
                    devices[i].phy.changes = split[j + 5]
                    devices[i].phy.lastChange = ""
    
                    devices[i].port = i
                    devices[i].description = getDescription(devices[i].lldp);
    
                    for (let k = j + 6; k < split.indexOf("PCS"); k++) {
                        devices[i].phy.lastChange += split[k] + " "
                    }
                    devices[i].phy.lastChange = devices[i].phy.lastChange.slice(0, -1)
                }
            }
        }
        return devices;
    }

    let promisses = [];
    for (var i = 0; i < Switches.length; i++) {
      promisses.push(doApi(phyRequest, Switches[i].IP));
    }
    return Promise.all(promisses).then((values) => {
        let filteredDevices = [];
        for (var i = 0; i < values.length; i++) {
            if (typeof values[i] !== "undefined") {
                let procDev = processSwitchPhy(values[i], data.neighbors[Switches[i].Name]);

                for (let dev in procDev) {
                    if ("phy" in procDev[dev]) {
                        let time = procDev[dev].phy.lastChange.split(" ")[0].split(":")
                        let timeTotal = parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2])
                        if (timeTotal < 300) {
                            procDev[dev].switch = Switches[i].Name;
                            filteredDevices.push(procDev[dev])
                        }
                    }
                }
            } else {
                log("Return data from switch empty, is the switch online?", "W");
            }
        }
        data.phy = filteredDevices;
        sendData({"command":"log", "type":"phy", "data":data.phy});
    });
}

function switchFibre() {
    let Switches = switches();
    log("Looking for low fibre levels in trancievers", "A");
    function processSwitchFibre(response, devices) {
        let keys = Object.keys(devices)
        let ints = response.result[0].interfaces
        for (let i in ints) {
            let int = ints[i]
            if ('rxPower' in int) {
                if (!keys.includes(i)) {
                    devices[i] = {}
                }
                devices[i].port = i
                devices[i].description = getDescription(devices[i].lldp);
                devices[i].rxPower = int.rxPower.toFixed(1)
                if ('txPower' in int)
                    devices[i].txPower = int.txPower.toFixed(1)
            }
        }
        return devices;
    }
    
    let promisses = [];
    for (var i = 0; i < Switches.length; i++) {
      promisses.push(doApi(fibreRequest, Switches[i].IP));
    }
    return Promise.all(promisses).then((values) => {
        let filteredDevices = [];
        for (var i = 0; i < values.length; i++) {
            if (typeof values[i] !== "undefined") {
                let procDev = processSwitchFibre(values[i], data.neighbors[Switches[i].Name]);

                for (let dev in procDev) {
                    if ('txPower' in procDev[dev] && 'rxPower' in procDev[dev]) {
                        if (procDev[dev].rxPower < -9 && procDev[dev].rxPower > -30 && procDev[dev].txPower > -30) {
                            procDev[dev].switch = Switches[i].Name;
                            filteredDevices.push(procDev[dev])
                        }
                    }
                }
            } else {
                log("Return data from switch empty, is the switch online?", "W");
            }
        }
        data.fibre = filteredDevices;
        sendData({"command":"log", "type":"mac", "data":data.fibre});
    });
}

function checkUps() {
    let Ups = ups();
    log("Getting UPS status", "A");
    function getUpsStatus(ip) {
        return fetch("http://" + ip + "/json/live_data.json?_=" + Math.floor(Math.random() * 10000000), {
            method: "GET"
        }).then((response) => {
            if (response.status === 200) {
                return response.json().then((jsonRpcResponse) => {
                    return {
                        ip: ip,
                        linePresent: jsonRpcResponse['line present'],
                        outputPowered: jsonRpcResponse['output powered'],
                        voltageIn: jsonRpcResponse.vin1,
                        voltageOut: jsonRpcResponse.vout1,
                        freqIn: Math.round(jsonRpcResponse.fin / 10),
                        freqOut: Math.round(jsonRpcResponse.fout / 10),
                        load: jsonRpcResponse.load1,
                        autonomy: jsonRpcResponse.authonomy
                    }
                })
            }
        })
    }

    let promises = []
    for (let index = 0; index < Ups.length; index++) {
        promises.push(getUpsStatus(Ups[index].IP));
    }

    return Promise.allSettled(promises).then((values) => {
        let filteredUps = [];

        for (let i = 0; i < Ups.length; i++) {
            if (values[i].status === "rejected") {
                Ups[i].Status = "Offline";
                if (!Ups[i].linePresent || !Ups[i].outputPowered || Ups[i].load > 80) {
                    filteredUps.push(Ups[i])
                }
            } else {
                values[i].value.name = Ups[i].Name;
                delete values[i].value.ip;
                Ups[i] = values[i].value;
                Ups[i].Status = "Online";
            }
        }
        data.ups = filteredUps;
        sendData({"command":"log", "type":"mac", "data":data.ups});
    })
}

function checkDevices() {
    log("Checking device lists for missing devices", "A");
    let Devices = devices();
    let missingDevices = {};
    let expectedDevices = [];
    for (let i in Devices) {
        let t = Devices[i];
        for (let j = t.start; j < t.end + 1; j++) {
            expectedDevices.push(t.name + j)
        }
    }

    for (const Switch in data.neighbors) {
        if (Object.hasOwnProperty.call(data.neighbors, Switch)) {
            let lldpNeighborsObj = data.neighbors[Switch];
            let lldpNeighbors = [];
            for (let port in lldpNeighborsObj) {
                let Neighbor = lldpNeighborsObj[port];
                if (Neighbor.lldp) {
                    lldpNeighbors.push(Neighbor.lldp);
                }
            }

            missingSwitchDevices = expectedDevices.filter(x => !lldpNeighbors.includes(x));
            for (let index = 0; index < missingSwitchDevices.length; index++) {
                const device = missingSwitchDevices[index];
                if (typeof missingDevices[device] === "undefined") {
                    missingDevices[device] = [];
                }
                missingDevices[device].push(Switch);
            }
        }
    }
    data.devices = missingDevices;
    sendData({"command":"log", "type":"mac", "data":data.devices});
}

function doApi(json, ip) {
    return fetch(`http://admin:N3p@G1R214:)@${ip}/command-api`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "Authorization": "Basic " + Buffer.from("admin:N3p@G1R214:)").toString('base64')
        },
        body: JSON.stringify(json),
    }).then((response) => {
        if (response.status === 200) {
            return response.json().then((jsonRpcResponse) => { return jsonRpcResponse })
        }
    }).catch((error)=>{
        logObj(`Failed to connect to switch ${ip}`, error, "E");
    })
}


/* Web Logging Functions */


function webLogTemp() {
    let Frames = frames();
	log('Getting temperatures', "A");

    let promises = [];

    for (let index = 0; index < Frames.length; index++) {
        const frame = Frames[index];
        promises.push(axios.get("http://"+frame.IP, { timeout: 1000 }));
    }

	return Promise.allSettled(promises).then(results => {
		log('Got temperature data, processing', "D");
		let tempSum = 0;
		let tempValid = 0;
        for (let index = 0; index < Frames.length; index++) {
            const frameData = results[index];
            if (frameData.status == "fulfilled") {
                let temp = 0;
                let frameStat = frameData.value.data.split(`<p><b>Temperature In:</b></p>`)[1].slice(25,27);
                if (frameStat == "OK") {
                    let unfilteredTemp = frameData.value.data.split(`<p><b>Temperature In:</b></p>`)[1].slice(29,33);
                    temp = parseInt(unfilteredTemp.substring(0, unfilteredTemp.indexOf(')')));
                } else {
                    log(`${Frames[index].Name} frame temperature is not OK`, "W");
                }
                Frames[index].Temp = temp;
                tempSum += temp;
                tempValid++;
                log(`${Frames[index].Name} temperature = ${temp} deg C`, "D");
            } else {
                log(`can't connect to ${Frames[index].Name}`, "W");
            }
        }

		let tempAvg;

		if (tempValid == 0) {
			log(`Something is badly wrong`, "E");
			sendSms(`CANNOT CONNECT TO MCR, MAYBE IT HAS MELTED?`);
			
		} else {
			tempAvg = tempSum / tempValid;
			log(`Average temperature = ${tempAvg} deg C`, "D");
			log(`Warning temperature = ${config.warningTemperature} deg C`, "D");

			if (tempAvg > config.warningTemperature) {
				log(`Warning: Temperature over warning limit, sending SMS`, "W");
				sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`);
			}
		}

        sendData({"command":"log", "type":"temperature", "data":Frames});
				
	})

}

function webLogPing() {
    sendData({"command":"log", "type":"ping"});
}

function webLogBoot() {
    sendData({"command":"log", "type":"boot"});
}

function sendSms(msg) {
    if (!config.textsEnabled) {
        return
    }
    
	let params = {
		Message: msg,
		TopicArn: 'arn:aws:sns:eu-west-2:796884558775:TDS_temperature'
	}

	let promise = new AWS.SNS({ apiVersion: '2010-03-31' }).publish(params).promise()
	promise.then(function (data) {
		log(`Text message sent - messageId: ${data.MessageId}`);
	}).catch(function (err) {
		console.error(err, err.stack)
	})
}

function connectToWebServer(retry = false) {

    let webSocket;

    if ((!webServer.connected && webServer.active && webServer.attempts < 3) || (retry && !webServer.connected)) {
        let inError = false;
        if (retry) {
            log(`Retrying connection to dead server: ${r}wss://${webServer.address}${reset}`, "W");
        }
        webSocket = new WebSocket("wss://"+webServer.address);

        webServer.socket = webSocket;

        webSocket.on('open', function open() {
            let payload = {};
            payload.command = "register";
            payload.name = config.installName;
            sendData(payload);

            log(`${g}${webServer.address}${reset} Established a connection to webserver`, "S");
            webServer.connected = true;
            webServer.active = true;
            webServer.attempts = 0;
        });

        webSocket.on('message', function message(msgJSON) {
            let msgObj = {};
            let pObj;
            let hObj;
            try {
                msgObj = JSON.parse(msgJSON);
                if (msgObj.payload.command !== "ping" && msgObj.payload.command !== "pong") {
                    logObj('Received from other server', msgObj, "A");
                } else if (printPings == true) {
                    logObj('Received from other server', msgObj, "A");
                }
                pObj = msgObj.payload;
                hObj = msgObj.header;
                switch (pObj.command) {
                    case "ping":
                        let payload = {};
                        payload.command = "pong";
                        sendData(payload);
                        break;
                    case "data":
                        log("Recieved temp/ping data from server", "D");
                        break;
                    default:
                        logObj(`Received unknown from other server`, msgObj, "W");
                }
            } catch (e) {
                try {
                    msgObj = JSON.parse(msgJSON);
                    if (msgObj.payload.command !== "ping" && msgObj.payload.command !== "pong") {
                        logObj('Received from other server', msgObj, "A");
                    } else if (printPings == true) {
                        logObj('Received from other server', msgObj, "A");
                    }
                    if (typeof msgObj.type == "undefined") {
                        let stack = e.stack.toString().split(/\r\n|\n/);
                        stack = JSON.stringify(stack, null, 4);
                        log(`Server error, stack trace: ${stack}`, "E");
                    } else {
                        log("A device is using old 'chiltv' data format, upgrade it to v4.0 or above", "E");
                    }
                } catch (e2) {
                    log("Invalid JSON from other server- "+e, "E");
                    logObj('Received from other server', msgObj, "A");
                }
            }
        });

        webSocket.on('close', function close() {
            webServer.connected = false;
            webServer.socket = null;
            webServer.attempts++;
            if (!inError) {
                log(`${r}${webServer.address}${reset} Outbound webserver connection closed`, "W");
            }
        });

        webSocket.on('error', function error() {
            inError = true;
            log(`Could not connect to server: ${r}${webServer.address}${reset}`, "E");
        });
    } else if (!webServer.connected && webServer.active) {
        webServer.active = false;
        log(`Server not responding, changing status to dead: ${r}${webServer.address}${reset}`, "E");
    }
}

function sendData(payload) {
    let packet = {};
    let header = makeHeader();
    packet.header = header;
    packet.payload = payload;
    if (webServer.connected) {
        webServer.socket.send(JSON.stringify(packet));
    }
}

function makeHeader() {
    let header = {};
    header.fromID = serverID;
    header.timestamp = new Date().getTime();
    header.version = serverVersion;
    header.type = "System";
    header.system = config.systemName;
    header.active = true;
    header.messageID = header.timestamp;
    return header;
}


/* Utility Functions */


function getDescription(deviceName) {
    if (typeof deviceName !== "undefined") {
        const map = devices().reduce((obj, item) => Object.assign(obj, { [item.name]: item.description }), {});
        let trimmedDeviceName = deviceName.slice(0, deviceName.lastIndexOf('_') + 1);
        return map[trimmedDeviceName];
    } else {
        return undefined;
    }
}

function minutes(n) {
    return parseInt(n) * 60;
}

function clearEmpties(o) {
    for (var k in o) {
        if (!o[k] || typeof o[k] !== "object") {
            continue // If null or not an object, skip to the next iteration
        }
    
        // The property is an object
        clearEmpties(o[k]); // <-- Make a recursive call on the nested object
        if (Object.keys(o[k]).length === 0) {
            delete o[k]; // The object had no properties, so delete that property
        }
    }
    return o;
}

function trickleStart(callback, seconds) {
    setInterval(callback, seconds * 1000);
    return callback();
}

function printConfig() {
    for (const key in config) {
        if (Object.hasOwnProperty.call(config, key)) {
            const value = config[key];
            log(`Configuration option ${y}${key}${reset} has been set to: ${b}${value}${reset}`,"H");
        }
    }

    for (const key in logsConfig) {
        if (Object.hasOwnProperty.call(logsConfig, key)) {
            const value = logsConfig[key];
            log(`Configuration option ${y}${key}${reset} has been set to: ${b}${value}${reset}`,"H");
        }
    }
}


/* Loops */


function startLoops() {
    connectToWebServer(true);

    // 5 Second ping loop
    setInterval(() => {
        connectToWebServer();
    }, 5*1000);
  
    // 1 Minute ping loop
    setInterval(() => {
        connectToWebServer(true);
    }, 60*1000);
}


/* Start Functions */


if (config.webEnabled) {
    startLoops();
    webLogBoot();
    trickleStart(webLogTemp, tempFrequency)
    .then(value => trickleStart(webLogPing, pingFrequency));
}
if (!config.devMode) {
    trickleStart(lldpLoop, lldpFrequency)
    .then(value => trickleStart(switchMac, switchStatsFrequency))
    /*.then(value => trickleStart(switchPhy, switchStatsFrequency))*/
    .then(value => trickleStart(switchFibre, switchStatsFrequency))
    .then(value => trickleStart(checkUps, upsFrequency))
    .then(value => trickleStart(checkDevices, devicesFrequency));
}