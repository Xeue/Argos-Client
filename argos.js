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

const express = require('express')
const fetch = require('node-fetch')
const axios = require('axios');
const AWS = require('aws-sdk');
const jsdom = require('jsdom');
const https = require('https');
const fs = require('fs');
require('./logs.js')();

const config = JSON.parse(fs.readFileSync(__dirname + "/config.conf"));
const loggingLevel = config.loggingLevel ? config.loggingLevel : "W";
const port = config.port ? config.port : 3000;
const warningTemperature = config.warningTemperature ? config.warningTemperature : 30;
const webEnabled = config.webEnabled ? config.webEnabled : false;
const webEndpoint = config.webEndpoint;
const textsEnabled = config.textsEnabled ? config.textsEnabled : false;
const awsAccessKeyId = config.awsAccessKeyId;
const awsSecretAccessKey = config.awsSecretAccessKey;
const awsRegion = config.awsRegion;
const devMode = config.devMode ? config.devMode : false;

const logsConfig = {
    "createLogFile": true,
    "logsFileName": "ArgosLogging",
    "configLocation": __dirname,
    "loggingLevel": loggingLevel,
    "debugLineNum": true
}
setLogsConf(logsConfig);

const app = express()

const data = {
    "neighbors": {},
    "fibre":{},
    "phy": {},
    "mac": {},
    "ups": {},
    "devices":{}
}

const pingFrequency = 10;
const lldpFrequency = 30;
const switchStatsFrequency = 30;
const upsFrequency = 30;
const devicesFrequency = 30;
const tempFrequency = minutes(5);

let awsCredentials = new AWS.Credentials(awsAccessKeyId, awsSecretAccessKey);
if (textsEnabled) {
    AWS.config.update({ region: awsRegion});
    AWS.config.credentials = awsCredentials;
}


printHeader(asci);


/* Data */


function loadData(file) {
    let dataRaw = fs.readFileSync(`${__dirname}/data/${file}.json`);
    let data;
    try {
        data = JSON.parse(dataRaw);
        return data;
    } catch (error) {
        logObj(`There is an error with the syntax of the JSON in ${file}.json file`, error, "W");
        return [];
    }
};

function switches() {
    return loadData("Switches");
}
function frames() {
    return loadData("Frames");
}
function ups() {
    return loadData("Ups");
}
function devices() {
    return loadData("Devices");
}


/* Express setup & Endpoints */

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static('public'))

app.listen(port, "0.0.0.0", () => {
    log(`Argos can be accessed at http://localhost:${port}`, "C");
})

app.get('/',  (req, res) =>  {
    log("New client connected", "A");
    res.header('Content-type', 'text/html');
    res.render('ui', {
        switches:switches()
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
        let neighbors = values[i].result[1].lldpNeighbors;
        data.neighbors[Switches[i].Name] = {};
        let thisSwitch = data.neighbors[Switches[i].Name];
        for (let j in neighbors) {
          let t = neighbors[j];
          if (!t.port.includes("Ma")) {
            thisSwitch[t.port] = { lldp: t.neighborDevice };
          }
        }
      }
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

        }
        data.mac = filteredDevices;
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
            let t = phy[i]
            let split = t.phyStatuses[0].text.replace(/\s\s+/g, ' ').split(' ')
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
            values[i];
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
        }
        data.phy = filteredDevices;
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
            values[i];
            let procDev = processSwitchFibre(values[i], data.neighbors[Switches[i].Name]);

            for (let dev in procDev) {
                if ('txPower' in procDev[dev] && 'rxPower' in procDev[dev]) {
                    if (procDev[dev].rxPower < -9 && procDev[dev].rxPower > -30 && procDev[dev].txPower > -30) {
                        procDev[dev].switch = Switches[i].Name;
                        filteredDevices.push(procDev[dev])
                    }
                }
            }
        }
        data.fibre = filteredDevices;
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
}

function doApi(json, ip) {
    return fetch(`http://grass:valley@${ip}/command-api`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "Authorization": "Basic " + Buffer.from("grass:valley").toString('base64')
        },
        body: JSON.stringify(json),
    }).then((response) => {
        if (response.status === 200) {
            return response.json().then((jsonRpcResponse) => { return jsonRpcResponse })
        }
    })
}


/* Web Logging Functions */


function webLogTemp() {
    let Frames = frames();
	log('Getting temperatures', "A");

    let promises = [];

    for (let index = 0; index < Frames.length; index++) {
        const frame = Frames[index];
        promises.push(axios.get(frame.IP, { timeout: 1000 }));
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
			log(`Warning temperature = ${warningTemperature} deg C`, "D");

			if (tempAvg > warningTemperature) {
				log(`Warning: Temperature over warning limit, sending SMS`, "W");
				sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`);
			}
		}

		axios.post(`${webEndpoint}/temp`, Frames).then(
			res => {log("Uploaded to website", "D")}
		).catch(
			error => {
				logObj(`Couldn't upload to website`, error, "E");
			}
		)
				
	})

}

function webLogPing() {
	axios.get(`${webEndpoint}/ping`).then(
		res => {log("Pinging website", "A")}
	).catch(
		error => {
			logObj(`Couldn't ping website`, error, "E");
		}
	)
}

function webLogBoot() {
	axios.get(`${webEndpoint}/boot`).then(
		res => {log("Telling website I booted", "A")}
	).catch(
		error => {
			logObj(`Couldn't tell the website I booted`, error, "E");
		}
	)
}

function sendSms(msg) {
    if (!textsEnabled) {
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


/* Start Functions */

if (webEnabled) {
    webLogBoot();
    trickleStart(webLogTemp, tempFrequency)
    .then(value => trickleStart(webLogPing, pingFrequency));
}
if (!devMode) {
    trickleStart(lldpLoop, lldpFrequency)
    .then(value => trickleStart(switchMac, switchStatsFrequency))
    .then(value => trickleStart(switchPhy, switchStatsFrequency))
    .then(value => trickleStart(switchFibre, switchStatsFrequency))
    .then(value => trickleStart(checkUps, upsFrequency))
    .then(value => trickleStart(checkDevices, devicesFrequency));
}