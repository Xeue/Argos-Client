/* eslint-disable no-unused-vars */
const serverID = new Date().getTime();

import WebSocket from 'ws';
import express from 'express';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import {homedir} from 'os';
import {Logs as _Logs} from 'xeue-logs';
import {Config as _Config} from 'xeue-config';
import {SQLSession as _SQL} from 'xeue-sql';
import {Server as _Server} from 'xeue-webserver';
import _SysLogServer from './syslog.js';
import Package from './package.json' with {type: "json"};
import ping from 'ping';
import https from 'https';

const version = Package.version;

const httpsAgent = new https.Agent({
	rejectUnauthorized: false,
});

const __internal = import.meta.dirname;

const __dirname = import.meta.dirname
const __data = path.join(homedir(), 'ArgosData');
const __static = path.resolve(__dirname+"/static");
const __views = path.resolve(__internal+"/views");

Array.prototype.symDiff = function(x) {
	return this.filter(y => !x.includes(y)).concat(x => !y.includes(x));
}

Array.prototype.diff = function(x) {
	return this.filter(y => !x.includes(y));
}

/* Data Defines */

const data = {
	'neighbors': {
		'Control': {},
		'Media': {}
	},
	'fibre':{
		'Control': {},
		'Media': {}
	},
	'mac': {
		'Control': {},
		'Media': {}
	},
	'devices':{
		'Control':{},
		'Media':{}
	},
	'power': {
		'Control':{},
		'Media':{}
	},
	'fans': {
		'Control':{},
		'Media':{}
	},
	'temperature': {
		'Control':{},
		'Media':{}
	},
	'interfaces': {
		'Control':{},
		'Media':{}
	},
	'ups': {},
	'phy': {},
	'ports': {
		'Control': {},
		'Media': {}
	}
};
const localPingsData = {};
const cloudServer = {
	'connected': false,
	'active': false,
	'attempts': 0
};
const tables = [{
	name: 'temperature',
	definition: `CREATE TABLE \`temperature\` (
		\`PK\` int(11) NOT NULL,
		\`sensor\` text NOT NULL,
		\`sensorType\` text NOT NULL,
		\`temperature\` float NOT NULL,
		\`system\` text NOT NULL,
		\`time\` timestamp NOT NULL DEFAULT current_timestamp(),
		PRIMARY KEY (\`PK\`)
	)`,
	PK:'PK'
},{
	name: 'syslog',
	definition: `CREATE TABLE \`syslog\` (
		\`PK\` int(11) NOT NULL,
		\`message\` text NOT NULL,
		\`ip\` varchar(15) NOT NULL,
		\`system\` text NOT NULL,
		\`time\` timestamp NOT NULL DEFAULT current_timestamp(),
		PRIMARY KEY (\`PK\`)
	)`,
	PK:'PK'
}];

const SwitchRequests = {
	'NXOS': {
		'neighborRequest': "show cdp neighbors",
		'transRequest': "show interface transceiver details",
		'flapRequest': "show interface mac",
		'power': 'show system environment power',
		'fans': 'show system environment cooling',
		'temperature': 'show system environment temperature',
		'interfaces': "show interface",
		'interfacesMonitoring': "show interface"
	},
	'EOS': {
		'neighborRequest': 'show lldp neighbors',
		'transRequest': 'show interfaces transceiver dom',
		'flapRequest': 'show interfaces mac',
		'phyRequest': 'show interfaces phy detail',
		'power': 'show system environment power',
		'fans': 'show system environment cooling',
		'temperature': 'show system environment temperature',
		'interfaces': 'show interfaces',
		'interfacesMonitoring': 'show interfaces'
	}
}

const EOS = {
	handleLLDP: (result, switchType, switchName) => {
		const neighbors = result.lldpNeighbors;
		data.neighbors[switchType][switchName] = {};
		const thisSwitch = data.neighbors[switchType][switchName];
		for (let j in neighbors) {
			const neighbor = neighbors[j];
			if (!Object.hasOwnProperty.call(neighbor, 'port')) continue;
			if (neighbor.port.includes('Ma')) continue;
			thisSwitch[neighbor.port] = { lldp: neighbor.neighborDevice };
		}
	},
	handleFibre: (filteredDevices, result, switchType, switchName) => {
		const devices = data.neighbors[switchType][switchName];
		const keys = Object.keys(devices);
		const interfaces = result.result.pop().interfaces;
		for (let interfaceName in interfaces) {
			const iface = interfaces[interfaceName];
			if ('parameters' in iface === false) continue;
			if ('rxPower' in iface.parameters === false) continue;

			if (!keys.includes(interfaceName)) devices[interfaceName] = {};
			devices[interfaceName].port = interfaceName;
			devices[interfaceName].description = getDescription(interfaceName, switchType, switchName);
			devices[interfaceName].rxPower = [];
			Object.values(iface.parameters.rxPower.channels).forEach(lane => {
				devices[interfaceName].rxPower.push(lane.toFixed(1));
			})
			devices[interfaceName].txPower = [];
			Object.values(iface.parameters.txPower.channels).forEach(lane => {
				devices[interfaceName].txPower.push(lane.toFixed(1));
			})
			try {
				data.interfaces[switchType][switchName][interfaceName].rxPower = devices[interfaceName].rxPower;
				data.interfaces[switchType][switchName][interfaceName].txPower = devices[interfaceName].txPower;
			} catch (error) {
				Logs.warn(`Unknown interface ${interfaceName}`, error);
				Logs.debug('Unknown interface data',data.interfaces[switchType][switchName]);
			}
		}

		ifaceLoop:
		for (let interfaceName in devices) {
			const iface = devices[interfaceName];
			if ('txPower' in iface === false) continue;
			if ('rxPower' in iface === false) continue;
			for (let index = 0; index < iface.rxPower.length; index++) {
				const rx = iface.rxPower[index];
				const tx = iface.txPower[index];
				if (tx == "-30.0") continue ifaceLoop;
				if (Number(rx) < thresholds.fibre && Number(rx) > -30 && Number(rx) > -30) {
					iface.switch = switchName;
					filteredDevices.push(iface);
					continue ifaceLoop;
				}
			}
		}
	},
	handleFlap: (filteredDevices, result, switchType, switchName) => {
		let devices = data.neighbors[switchType][switchName];
		const interfaces = result.result[1].interfaces;
		for (const ifaceName in interfaces) {
			if (!Object.hasOwnProperty.call(interfaces, ifaceName)) return;
			const iface = interfaces[ifaceName];
			if (!devices[ifaceName]) devices[ifaceName] = {};
			devices[ifaceName].mac = {
				'operState': iface.intfState,
				'phyState': iface.phyState,
				'macFault': iface.macRxRemoteFault,
				'lastChange': iface.intfStateLastChangeTime
			};
			devices[ifaceName].description = getDescription(ifaceName, switchType, switchName);
			devices[ifaceName].port = ifaceName;

		}
		devices = clearEmpties(devices);
		for (let deviceNumber in devices) {
			const device = devices[deviceNumber]
			if (device.mac === undefined) continue;
			if(!('lastChange' in device.mac)) Logs.warn(device+' seems to have an issue');
			const timeTotal = Date.now() - (device.mac.lastChange * 1000);
			if (timeTotal > 300000 || timeTotal == 0) continue;
			device.switch = switchName;
			filteredDevices.push(device);
		}
	},
	handlePower: (result, switchType, switchName) => {
		const power = {};
		const PSUs = result.result[1].powerSupplies;
		for (const PSUIndex in PSUs) {
			if (Object.hasOwnProperty.call(PSUs, PSUIndex)) {
				const PSU = PSUs[PSUIndex];
				const inAlert = PSU.status == "ok" ? false : true;
				power[PSUIndex] = {
					"outputPower": PSU.outputPower,
					"inAlert": inAlert,
					"uptime": PSU.uptime
				};
			}
		}
		data.power[switchType][switchName] = power;
	},
	handleTemperature: (result, switchType, switchName) => {
		const slots = result.result[1].cardSlots;
		const temperature = {};
		slots.forEach(slot => {
			const temps = slot.tempSensors.map(sensor => sensor.currentTemperature);
			const alerts = slot.tempSensors.filter(sensor => sensor.inAlertState);
			const inAlert = alerts.length > 0 ? false : true;
			const temp = temps.reduce((partialSum, a) => partialSum + a, 0)/temps.length;
			temperature[`${slot.entPhysicalClass} ${slot.relPos}`] = {
				"temp": temp,
				"inAlert": inAlert
			};
		});
		data.temperature[switchType][switchName] = temperature;
	},
	handleFans: (result, switchType, switchName) => {
		const psuSlots = result.result[1].powerSupplySlots;
		const traySlots = result.result[1].fanTraySlots;
		const fans = {};
		psuSlots.forEach(slot => {
			const speeds = slot.fans.map(fan => fan.actualSpeed);
			const speed = speeds.reduce((partialSum, a) => partialSum + a, 0)/speeds.length
			const inAlert = slot.status !== "ok" ? false : true;
			fans[slot.label] = {
				"speed": speed,
				"inAlert": inAlert
			};
		});
		traySlots.forEach(slot => {
			const speeds = slot.fans.map(fan => fan.actualSpeed);
			const speed = speeds.reduce((partialSum, a) => partialSum + a, 0)/speeds.length
			const inAlert = slot.status !== "ok" ? false : true;
			fans['Tray'+slot.label] = {
				"speed": speed,
				"inAlert": inAlert
			};
		});
		data.fans[switchType][switchName] = fans;
	},
	handleInterfaces: (result, switchType, switchName) => {
		const interfaces = result.result[1].interfaces;
		// data.interfaces[switchType][switchName] = {};
		for (const interfaceName in interfaces) {
			if (!interfaces.hasOwnProperty.call(interfaces, interfaceName)) return;
			const iface = interfaces[interfaceName];
			if (iface.hardware !== "ethernet") continue;
			if (data.interfaces[switchType][switchName] === undefined) data.interfaces[switchType][switchName] = {};
			const ifaceData = data.interfaces[switchType][switchName][interfaceName];
			if (ifaceData === undefined) {
				data.interfaces[switchType][switchName][interfaceName] = {
					"connected": iface.interfaceStatus == "connected" ? true : false,
					"description": iface.description,
					"inRate": iface.interfaceStatistics.inBitsRate,
					"outRate": iface.interfaceStatistics.outBitsRate,
					"maxRate": iface.bandwidth,
					"lastFlap": iface.lastStatusChangeTimestamp,
					"flapCount": iface.interfaceCounters.linkStatusChanges,
					"outErrors": iface.interfaceCounters.totalOutErrors,
					"outDiscards": iface.interfaceCounters.outDiscards,
					"inErrors": iface.interfaceCounters.totalInErrors,
					"inDiscards": iface.interfaceCounters.inDiscards
				}
			} else {
				ifaceData.connected = iface.interfaceStatus == "connected" ? true : false;
				ifaceData.description = iface.description;
				ifaceData.inRate = iface.interfaceStatistics.inBitsRate;
				ifaceData.outRate = iface.interfaceStatistics.outBitsRate;
				ifaceData.maxRate = iface.bandwidth;
				ifaceData.lastFlap = iface.lastStatusChangeTimestamp;
				ifaceData.flapCount = iface.interfaceCounters.linkStatusChanges;
				ifaceData.outErrors = iface.interfaceCounters.totalOutErrors;
				ifaceData.outDiscards = iface.interfaceCounters.outDiscards;
				ifaceData.inErrors = iface.interfaceCounters.totalInErrors;
				ifaceData.inDiscards = iface.interfaceCounters.inDiscards;
			}
		}
	}
}

const NXOS = {
	handleLLDP: (result, switchType, switchName) => {
		const neighbors = result.body.TABLE_cdp_neighbor_brief_info.ROW_cdp_neighbor_brief_info;
		const switchTypeObject = data.neighbors[switchType];
		switchTypeObject[switchName] = {};
		const thisSwitch = data.neighbors[switchType][switchName];
		for (let j in neighbors) {
			const neighbor = neighbors[j];
			if (!Object.hasOwnProperty.call(neighbor, 'intf_id')) continue;
			if (neighbor.intf_id?.includes('mgmt')) continue;
			thisSwitch[neighbor.intf_id] = {
				'interface': neighbor.intf_id,
				'lldp': neighbor.device_id,
				'model': neighbor.platform_id,
				'port': neighbor.port_id
			};
		}
	},
	handleFibre: (filteredDevices, result, switchType, switchName) => {
		const devices = data.neighbors[switchType][switchName];
		const keys = Object.keys(devices);
		const interfaces = result.result.body.TABLE_interface.ROW_interface;
		for (const interfaceNum in interfaces) {
			const iface = interfaces[interfaceNum];
			const interfaceName = iface.interface;
			if (iface.TABLE_lane === undefined) continue;
			const lanes = Array.isArray(iface.TABLE_lane.ROW_lane) ? iface.TABLE_lane.ROW_lane : [iface.TABLE_lane.ROW_lane];
			for (let laneNumber = 0; laneNumber < lanes.length; laneNumber++) {
				const lane = lanes[laneNumber];
				const interfaceLaneName = lanes.length > 1 ? `${interfaceName}/${laneNumber+1}` : interfaceName;
				if ('rx_pwr' in lane === false) continue
				if (!keys.includes(interfaceLaneName)) devices[interfaceLaneName] = {};
				devices[interfaceLaneName].port = interfaceLaneName;
				devices[interfaceLaneName].description = getDescription(interfaceLaneName, switchType, switchName);
				devices[interfaceLaneName].rxPower = Number(lane.rx_pwr).toFixed(1);
				if ('tx_pwr' in lane) devices[interfaceLaneName].txPower = Number(iface.tx_pwr).toFixed(1);
			}
		}
		for (let deviceNumber in devices) {
			const device = devices[deviceNumber];
			if ('txPower' in device === false) continue;
			if ('rxPower' in device === false) continue;
			if (device.rxPower > thresholds.fibre) continue;
			device.switch = switchName;
			filteredDevices.push(device);
		}
	},
	handleFlap: (filteredDevices, result, switchType, switchName) => {
		let devices = data.neighbors[switchType][switchName];
		const keys = Object.keys(devices);
		const split = result.output.split('\n');
		for (let i = 8; i < split.length; i++) {
			const t = split[i];
			const mac = {
				int: t.substr(0, 19).trim(),
				config: t.substr(19, 7).trim(),
				oper: t.substr(26, 9).trim(),
				phy: t.substr(34, 16).trim(),
				mac: t.substr(50, 6).trim(),
				last: t.substr(54, t.length).trim()
			};

			if (mac.config !== 'Up') continue;
			if (keys.includes(mac.int)) devices[mac.int] = {};
			devices[mac.int].mac = {};
			devices[mac.int].mac.operState = mac.oper;
			devices[mac.int].mac.phyState = mac.phy;
			devices[mac.int].mac.macFault = mac.mac;
			devices[mac.int].mac.lastChange = mac.last;
			devices[mac.int].description = getDescription(mac.int, switchType, switchName);
			devices[mac.int].port = mac.int;
		}
		devices = clearEmpties(devices);
		for (let deviceNumber in devices) {
			const device = devices[deviceNumber]
			if (device.mac === undefined) continue;
			if(!('lastChange' in device.mac)) Logs.warn(device+' seems to have an issue');
			const time = device.mac.lastChange.split(':');
			const timeTotal = parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2]);
			if (timeTotal > 300) continue;
			device.switch = switchName;
			filteredDevices.push(device);
		}
	},
	handlePower: (result, switchType, switchName) => {
		Logs.object(result);
	},
	handleTemperature: (result, switchType, switchName) => {
		Logs.object(result);
	},
	handleFans: (result, switchType, switchName) => {
		Logs.object(result);
	},
	handleInterfaces: (result, switchType, switchName) => {
		const interfaces = result.result.body.TABLE_interface.ROW_interface;
		data.interfaces[switchType][switchName] = {};
		interfaces.forEach(iface => {
			const interfaceName = iface.interface;
			data.interfaces[switchType][switchName][interfaceName] = {
				"connected": iface.state == "up" ? true : false,
				"description": iface.desc,
				"inRate": iface.eth_inrate1_bits,
				"outRate": iface.eth_outrate1_bits,
				"maxRate": iface.eth_bw,
				"lastFlap": iface.eth_link_flapped,
				"flapCount": 1,
				"outErrors": iface.eth_outerr,
				"outDiscards": iface.eth_outdiscard,
				"inErrors": iface.eth_inerr,
				"inDiscards": iface.eth_indiscard
			}
		})
	}
}

const pingFrequency = 30;
const lldpFrequency = 15;
const switchStatsFrequency = 30;
const upsFrequency = 30;
const devicesFrequency = 15;
const tempFrequency = minutes(1);
const localPingFrequency = 5;
const envFrequency = 30;
const interfaceFrequency = 15;

/* Globals */

const thresholds = {
	'fibre': -10,
	'bandwidth': 0.95,
	'discard': 1000,
	'errors': 1000,
}
let isQuiting = false;
let mainWindow = null;
let SQL;
let configLoaded = false;
let cachedUpsTemps = {};

const Logs = new _Logs(
	false,
	'ArgosLogging',
	__data,
	'D',
	false
)
const Config = new _Config(
	Logs
);
const Server = new _Server(
	expressRoutes,
	Logs,
	version,
	Config,
	doMessage
);
const SyslogServer = new _SysLogServer(
	Logs,
	doSysLogMessage
);

{ /* Config */
	Logs.printHeader('Argos Monitoring');
	Config.require('port', [], 'What port shall the server use');
	Config.require('syslogPort', [], 'What port shall the server listen to syslog messages on');
	Config.require('systemName', [], 'What is the name of the system');
	Config.require('warningTemperature', [], 'What temperature shall alerts be sent at');
	Config.require('interfaceWarnings', {true: 'Yes', false: 'No'}, 'Highlight interfaces with high error counts');
	{
		Config.require('bandwidthThreshold', [], 'Threshold for warning about high bandwith usage [0.0-1.0]', ['interfaceWarnings', true]);
		Config.require('discardThreshold', [], 'Threshold for warning about high interface discards [number]', ['interfaceWarnings', true]);
		Config.require('errorThreshold', [], 'Threshold for warning about high interface errors [number]', ['interfaceWarnings', true]);
	}
	Config.require('fibreThreshold', [], 'Threshold for warning about low fibre level [-number]');
	Config.require('webEnabled', {true: 'Yes', false: 'No'}, 'Should this system report back to an argos server');
	{
		Config.require('webSocketEndpoint', [], 'What is the url of the argos server', ['webEnabled', true]);
		Config.require('secureWebSocketEndpoint', {true: 'Yes', false: 'No'}, 'Does the server use SSL (padlock in browser)', ['webEnabled', true]);
	}
	Config.require('localDataBase', {true: 'Yes', false: 'No'}, 'Setup and use a local database to save warnings and temperature information');
	{
		Config.require('dbUser', [], 'Database Username', ['localDataBase', true]);
		Config.require('dbPass', [], 'Database Password', ['localDataBase', true]);
		Config.require('dbPort', [], 'Database port', ['localDataBase', true]);
		Config.require('dbHost', [], 'Database address', ['localDataBase', true]);
		Config.require('dbName', [], 'Database name', ['localDataBase', true]);
	}
	Config.require('textsEnabled', {true: 'Yes', false: 'No'}, 'Use AWS to send texts when warnings are triggered');
	{
		Config.require('awsAccessKeyId', [], 'AWS access key for texts', ['textsEnabled', true]);
		Config.require('awsSecretAccessKey', [], 'AWS Secret access key for texts', ['textsEnabled', true]);
		Config.require('awsRegion', [], 'AWS region', ['textsEnabled', true]);
	}
	Config.require('loggingLevel', {'A':'All', 'D':'Debug', 'W':'Warnings', 'E':'Errors'}, 'Set logging level');
	Config.require('createLogFile', {true: 'Yes', false: 'No'}, 'Save logs to local file');
	Config.require('advancedConfig', {true: 'Yes', false: 'No'}, 'Show advanced config settings');
	{
		Config.require('debugLineNum', {true: 'Yes', false: 'No'}, 'Print line numbers', ['advancedConfig', true]);
		Config.require('printPings', {true: 'Yes', false: 'No'}, 'Print pings', ['advancedConfig', true]);
		Config.require('devMode', {true: 'Yes', false: 'No'}, 'Dev mode - Disables connections to devices', ['advancedConfig', true]);
	}

	Config.default('port', 8080);
	Config.default('syslogPort', 514);
	Config.default('systemName', 'Unknown');
	Config.default('warningTemperature', 35);
	Config.default('interfaceWarnings', false);
	Config.default('webEnabled', false);
	Config.default('localDataBase', false);
	Config.default('dbPort', '3306');
	Config.default('dbName', 'argosdata');
	Config.default('dbHost', 'localhost');
	Config.default('textsEnabled', false);
	Config.default('loggingLevel', 'W');
	Config.default('createLogFile', true);
	Config.default('debugLineNum', false);
	Config.default('printPings', false);
	Config.default('advancedConfig', false);
	Config.default('devMode', false);
	Config.default('secureWebSocketEndpoint', true);
	Config.default('bandwidthThreshold', 0.95);
	Config.default('discardThreshold', 1000);
	Config.default('errorThreshold', 1000);
	Config.default('fibreThreshold', -10);

	if (!await Config.fromFile(path.join(__dirname, 'ArgosData', 'config.conf'))) {
		await Config.fromCLI(path.join(__dirname, 'ArgosData', 'config.conf'));
		//await config.fromAPI(path.join(__dirname, 'ArgosData', 'config.conf'), configQuestion, configDone);
	}

	thresholds.bandwidth = Config.get('bandwidthThreshold');
	thresholds.discard = Config.get('discardThreshold');
	thresholds.errors = Config.get('errorThreshold');
	thresholds.fibre = Config.get('fibreThreshold');

	Config.on('set', data => {
		switch (data.property) {
			case 'bandwidthThreshold': thresholds.bandwidth = data.value; break;
			case 'discardThreshold': thresholds.discard = data.value; break;
			case 'errorThreshold': thresholds.errors = data.value; break;
			case 'fibreThreshold': thresholds.fibre = data.value; break;
		}
	})

	if (Config.get('loggingLevel') == 'D' || Config.get('loggingLevel') == 'A') {
		Config.set('debugLineNum', true);
	}

	if (Config.get('textsEnabled')) {
		AWS.config.update({ region: Config.get('awsRegion')});
		AWS.config.credentials = new AWS.Credentials(Config.get('awsAccessKeyId'), Config.get('awsSecretAccessKey'));
	}

	Logs.setConf({
		'createLogFile': Config.get('createLogFile'),
		'logsFileName': 'ArgosLogging',
		'configLocation': __data,
		'loggingLevel': Config.get('loggingLevel'),
		'debugLineNum': Config.get('debugLineNum'),
	});

	Logs.log('Running version: v'+version, ['H', 'SERVER', Logs.g]);
	Logs.log(`Logging to: ${path.join(__data, 'logs')}`, ['H', 'SERVER', Logs.g]);
	Logs.log(`Config saved to: ${path.join(__data, 'config.conf')}`, ['H', 'SERVER', Logs.g]);
	Config.print();
	Config.userInput(async command => {
		switch (command) {
		case 'config':
			await Config.fromCLI(path.join(__data, 'config.conf'));
			if (Config.get('loggingLevel') == 'D' || Config.get('loggingLevel') == 'A') {
				Config.set('debugLineNum', true);
			}
			Logs.setConf({
				'createLogFile': Config.get('createLogFile'),
				'logsFileName': 'ArgosLogging',
				'configLocation': __data,
				'loggingLevel': Config.get('loggingLevel'),
				'debugLineNum': Config.get('debugLineNum')
			});
			return true;
		}
	});
	configLoaded = true;
}

if (Config.get('localDataBase')) {
	SQL = new _SQL(
		Config.get('dbHost'),
		Config.get('dbPort'),
		Config.get('dbUser'),
		Config.get('dbPass'),
		Config.get('dbName'),
		Logs
	);
	await SQL.init(tables);
	const sensor = await SQL.query("SHOW COLUMNS FROM `temperature` LIKE 'frame';");
	if (sensor.length == 0) {
		await SQL.query("ALTER TABLE `temperature` RENAME COLUMN frame TO sensor;");
	}
	const sensorType = await SQL.query("SHOW COLUMNS FROM `temperature` LIKE 'sensorType';");
	if (sensorType.length == 0) {
		await SQL.query("ALTER TABLE `temperature` ADD COLUMN sensorType text NOT NULL;");
		await SQL.query("UPDATE `temperature` SET sensorType = 'IQ Frame' WHERE 1=1;");
	}
}

Server.start(Config.get('port'));
SyslogServer.start(Config.get('syslogPort'));

Logs.log(`Argos can be accessed at http://localhost:${Config.get('port')}`, 'C');

connectToWebServer(true).then(()=>{
	webLogBoot();
});

// 1 Minute ping loop
setInterval(() => {
	connectToWebServer(true);
}, 60*1000);

await startLoopAfterDelay(logTemp, tempFrequency);
await startLoopAfterDelay(lldpLoop, lldpFrequency, 'Media');
await startLoopAfterDelay(switchInterfaces, interfaceFrequency, 'Media');
await startLoopAfterDelay(switchInterfaces, 5, 'Media', true);
await startLoopAfterDelay(switchFibre, 5, 'Media');
await startLoopAfterDelay(localPings, localPingFrequency);
await startLoopAfterDelay(connectToWebServer, 5);
await startLoopAfterDelay(webLogPing, pingFrequency);
await startLoopAfterDelay(switchEnv, envFrequency, 'Media');
await startLoopAfterDelay(checkDevices, devicesFrequency, 'Media', true);
await startLoopAfterDelay(switchFlap, switchStatsFrequency, 'Media');
await startLoopAfterDelay(checkEmbrionix, devicesFrequency, 'Media');
//await startLoopAfterDelay(switchPhy, switchStatsFrequency, 'Media');
await startLoopAfterDelay(lldpLoop, lldpFrequency, 'Control');
await startLoopAfterDelay(switchInterfaces, 5, 'Control', true);
await startLoopAfterDelay(switchInterfaces, interfaceFrequency, 'Control');
await startLoopAfterDelay(switchEnv, envFrequency, 'Control');
await startLoopAfterDelay(checkDevices, devicesFrequency, 'Control', false);
await startLoopAfterDelay(switchFibre, switchStatsFrequency, 'Control');
await startLoopAfterDelay(checkUps, upsFrequency);

function notification(title, text) {
}

/* Data */


function loadData(file) {
	try {
		const dataRaw = fs.readFileSync(`${__data}/data/${file}.json`);
		try {
			return JSON.parse(dataRaw);
		} catch (error) {
			Logs.error(`There is an error with the syntax of the JSON in ${file}.json file`, error);
			return [];
		}
	} catch (error) {
		Logs.warn(`Could not read the file ${file}.json, attempting to create new file`);
		Logs.debug('File error:', error);
		const fileData = [];
		switch (file) {
		case 'Devices':
			fileData[0] = {
				'name':'Placeholder',
				'description':'Placeholder',
				'deviceType': 'General'
			};
			break;
		case 'Switches':
			fileData[0] = {
				'Name':'Placeholder',
				'User': 'Username',
				'Pass': 'Password',
				'IP':'0.0.0.0',
				'Type': 'Media',
				'OS': 'EOS'
			};
			break;
		case 'Ports':
			fileData[0] = {
				'Switch':'Placeholder',
				'Port': 'Ethernet1/1/1',
			};
			break;
		case 'Pings':
			fileData[0] = {
				'Name':'Placeholder',
				'IP':'0.0.0.0',
				'SSH': false,
				'HTTP': false,
				'HTTPS': false
			};
		default:
			fileData[0] = {
				'Name':'Placeholder',
				'IP':'0.0.0.0'
			};
			break;
		}
		if (!fs.existsSync(`${__data}/data/`)){
			fs.mkdirSync(`${__data}/data/`);
		}
		fs.writeFileSync(`${__data}/data/${file}.json`, JSON.stringify(fileData, null, 4));
		return fileData;
	}
}
function writeData(file, data) {
	try {
		fs.writeFileSync(`${__data}/data/${file}.json`, JSON.stringify(data, undefined, 2));
	} catch (error) {
		Logs.error(`Could not write the file ${file}.json, do we have permission to access the file?`, error);
	}
}

function switches(type) {
	const Switches = loadData('Switches');
	if (type !== undefined) return Switches.filter(Switch => Switch.Type == type);
	return Switches;
}
function temps() {
	return loadData('Temps');
}
function ups() {
	return loadData('Ups');
}
function devices() {
	return loadData('Devices');
}
function pings() {
	return loadData('Pings');
}
function syslogSourceList() {
	const pingList = pings();
	const sourceList = {};
	pingList.forEach(pair => {
		sourceList[pair.IP] = pair.Name;
	})
	return sourceList;
}

function syslogSourceGroups() {
	const pingList = pings();
	const pingObject = {};
	pingList.forEach(ping => {
		if (!pingObject[ping.Group]) pingObject[ping.Group] = [];
		pingObject[ping.Group].push(ping);
	})

	return pingObject;

	//return [...new Set(Object.values(pingList).map(ping => ping.Group))];

	// const sourceList = {};
	// pingList.forEach(pair => {
	// 	sourceList[pair.IP] = pair.Name;
	// })
	// return sourceList;
}

function ports(type) {
	const Ports = loadData('Ports');
	const Switches = switches(type).map(arr => arr.Name);
	if (type !== undefined) return Ports.filter(port => Switches.includes(port.Switch));
	return Ports;
}


/* Express setup & Websocket Server */


function expressRoutes(expressApp) {
	expressApp.set('views', path.join(__internal, 'views'));
	expressApp.set('view engine', 'ejs');
	expressApp.use(express.json());
	expressApp.use(express.static(__static));

	expressApp.get('/',  (req, res) =>  {
		Logs.info('New client connected');
		res.header('Content-type', 'text/html');
		res.render('web', {
			switches:switches('Media'),
			controlSwitches:switches('Control'),
			systemName:Config.get('systemName'),
			webSocketEndpoint:Config.get('webSocketEndpoint'),
			secureWebSocketEndpoint:Config.get('secureWebSocketEndpoint'),
			webEnabled:Config.get('webEnabled'),
			version: version,
			pings:syslogSourceList(),
			pingGroups:syslogSourceGroups(),
			background:'bg-dark',
			thresholds: thresholds,
			internal: __internal,
			static: __static,
			views: __views
		});
	});

	expressApp.get('/about', (req, res) => {
		Logs.info('Collecting about information');
		res.header('Content-type', 'text/html');
		const aboutInfo = {
			'aboutInfo': {
				'Version': version,
				'Config': Config.all(),
				'Thresholds':thresholds,
				'Switches':switches(),
				'Temp Sensors':temps(),
				'UPS':ups(),
				'Devices':devices(),
				'Pings':pings(),
				'Port Monitoring':ports(),
				'Data': data
			},
			'systemName': Config.get('systemName'),
			'background': 'bg-dark'
		}
		res.render('about', aboutInfo);
	})

	expressApp.get('/data', (req, res) => {
		Logs.info('Collecting data');
		res.header('Content-type', 'text/html');
		const dataInfo = {
			'data': data,
			'systemName': Config.get('systemName'),
			'background': 'bg-dark'
		}
		res.render('data', dataInfo);
	})

	expressApp.get('/app',  (req, res) =>  {
		Logs.info('New client connected');
		res.header('Content-type', 'text/html');
		res.render('web', {
			switches:switches('Media'),
			controlSwitches:switches('Control'),
			systemName:Config.get('systemName'),
			webSocketEndpoint:Config.get('webSocketEndpoint'),
			secureWebSocketEndpoint:Config.get('secureWebSocketEndpoint'),
			webEnabled:Config.get('webEnabled'),
			version: version,
			pings:syslogSourceList(),
			pingGroups:syslogSourceGroups(),
			background:'micaActive',
			thresholds: thresholds,
			internal: __internal,
			static: __static,
			views: __views
		});
	});

	expressApp.get('/appAbout', (req, res) => {
		Logs.info('Collecting about information');
		res.header('Content-type', 'text/html');
		const aboutInfo = {
			'aboutInfo': {
				'Version': version,
				'Config': Config.all(),
				'Thresholds':thresholds,
				'Switches':switches(),
				'Temp Sensors':temps(),
				'UPS':ups(),
				'Devices':devices(),
				'Pings':pings(),
				'Port Monitoring':ports()
			},
			'systemName': Config.get('systemName'),
			'background': 'micaActive'
		}
		res.render('about', aboutInfo);
	})

	expressApp.get('/appData', (req, res) => {
		Logs.info('Collecting data');
		res.header('Content-type', 'text/html');
		const dataInfo = {
			'data': data,
			'systemName': Config.get('systemName'),
			'background': 'micaActive'
		}
		res.render('data', dataInfo);
	})

	expressApp.get('/getConfig', (req, res) => {
		Logs.debug('Request for devices config');
		let catagory = req.query.catagory;
		let data;
		switch (catagory) {
		case 'switches':
			data = switches();
			break;
		case 'ports':
			data = ports();
			break;
		case 'temps':
			data = temps();
			break;
		case 'ups':
			data = ups();
			break;
		case 'devices':
			data = devices();
			break;
		case 'pings':
			data = pings();
			break;
		default:
			break;
		}
		res.send(JSON.stringify(data));
	});

	expressApp.get('/config', (req, res) => {
		Logs.info('Requesting app config');
		res.send(JSON.stringify(Config.all()));
	});

	expressApp.post('/setswitches', (req, res) => {
		Logs.debug('Request to set switches config data');
		writeData('Switches', req.body);
		res.send('Done');
	});
	expressApp.post('/setports', (req, res) => {
		Logs.debug('Request to set ports config data');
		writeData('Ports', req.body);
		res.send('Done');
	});
	expressApp.post('/setdevices', (req, res) => {
		Logs.debug('Request to set devices config data');
		writeData('Devices', req.body);
		res.send('Done');
	});
	expressApp.post('/setups', (req, res) => {
		Logs.debug('Request to set ups config data');
		writeData('Ups', req.body);
		res.send('Done');
	});
	expressApp.post('/settemps', (req, res) => {
		Logs.debug('Request to set temps config data');
		writeData('Temps', req.body);
		res.send('Done');
	});
	expressApp.post('/setpings', (req, res) => {
		Logs.debug('Request to set pings config data');
		writeData('Pings', req.body);
		res.send('Done');
	});
}

async function doMessage(msgObj, socket) {
	const payload = msgObj.payload;
	const header = msgObj.header;
	if (typeof payload.source == 'undefined') {
		payload.source = 'default';
	}
	switch (payload.command) {
	case 'meta':
		Logs.debug('Received', msgObj);
		socket.send('Received meta');
		break;
	case 'register':
		coreDoRegister(socket, msgObj);
		break;
	case 'get':
		switch (payload.data) {
			case 'temperature':
				getTemperature(header, payload, 'IQ Frame').then(data => {
					Server.sendTo(socket, data);
				});
				break;
			case 'temperatureGeneric':
				getTemperature(header, payload, 'Will N Sensor').then(data => {
					Server.sendTo(socket, data);
				});
				break;
			case 'syslog':
				getSyslog(header, payload).then(data => {
					Logs.debug(`Retrieved ${data.logs.length} SYSLOG messages`);
					Server.sendTo(socket, data);
				})
			default:
				break;
		}
		break;
	default:
		Logs.warn('Unknown message', msgObj);
	}
}

async function doSysLogMessage(msg, info) {
	const message = msg.toString().replace(/\'/g, '"');
	if (Config.get('localDataBase')) SQL.insert({
		'message': message,
		'ip': info.address,
		'system': Config.get('systemName')
	}, 'syslog');
	Server.sendToAll({
		'command': 'data',
		'data': 'syslog',
		'system': Config.get('systemName'),
		'replace': false,
		'logs': [{
			'message': message,
			'ip': info.address,
			'system': Config.get('systemName'),
			'time': new Date()
		}]
	})

}

async function getTemperature(header, payload, type) {
	Logs.debug(`Getting temps for ${header.system}`);
	const from = payload.from;
	const to = payload.to;
	const dateQuery = `SELECT ROW_NUMBER() OVER (ORDER BY PK) AS Number, \`PK\`, \`time\` FROM \`temperature\` WHERE time BETWEEN FROM_UNIXTIME(${from}) AND FROM_UNIXTIME(${to}) AND \`system\` = '${header.system}' AND \`sensorType\` = '${type}' GROUP BY \`time\`; `;

	if (!Config.get('localDataBase')) return {
		'command':'data',
		'data':'temps',
		'type': type,
		'system':header.system,
		'replace': true,
		'points':{}
	};

	const grouped = await SQL.query(dateQuery);
	if (grouped.length === 0) {
		return {
			'command':'data',
			'data':'temps',
			'type': type,
			'system':header.system,
			'replace': true,
			'points':{}
		};
	}
	
	const divisor = Math.ceil(grouped.length/1000);
	const whereArr = grouped.map((a)=>{
		if (parseInt(a.Number) % parseInt(divisor) == 0) {
			const data = new Date(a.time).toISOString().slice(0, 19).replace('T', ' ');
			return `'${data}'`;
		}
	}).filter(Boolean);
	const whereString = whereArr.join(',');
	let query;
	if (whereString == '') {
		query = `SELECT * FROM \`temperature\` WHERE \`system\` = '${header.system}' AND \`sensorType\` = '${type}' ORDER BY \`PK\` ASC LIMIT 1; `;
	} else {
		query = `SELECT * FROM \`temperature\` WHERE time IN (${whereString}) AND \`system\` = '${header.system}' AND \`sensorType\` = '${type}' ORDER BY \`PK\` ASC; `;
	}

	const rows = await SQL.query(query);

	const dataObj = {
		'command':'data',
		'data':'temps',
		'type': type,
		'system':header.system,
		'replace': true,
		'points':{}
	};

	rows.forEach((row) => {
		let timestamp = row.time.getTime();
		if (!dataObj.points[timestamp]) {
			dataObj.points[timestamp] = {};
		}
		let point = dataObj.points[timestamp];
		point[row.sensor] = row.temperature;

		delete point.average;
		const n = Object.keys(point).length;
		const values = Object.values(point);
		const total = values.reduce((accumulator, value) => {
			return accumulator + value;
		}, 0);
		point.average = total/n;
	});

	return dataObj;
}

async function getSyslog(header, payload) {
	//Logs.debug(`Getting syslogs for ${header.system}, ips: ${payload.ips.map(ip => `'${ip}'`).join(',')}`);
	const from = payload.from;
	const to = payload.to;
	let whereIP = '';
	if (payload.ips.length > 0 && !payload.ips.includes('all')) {
		const ips = [];
		payload.ips.forEach(ip => {
			if (ip.includes(',')) ip.split(',').forEach(newIP => ips.push(newIP));
			else ips.push(`'${ip}'`);
		})
		whereIP = `AND \`ip\` IN (${ips.join(',')})`
	}
	if (payload.ipsEx.length > 0 && !payload.ipsEx.includes('none')) {
		const ipsEx = [];
		payload.ipsEx.forEach(ip => {
			if (ip.includes(',')) ip.split(',').forEach(newIP => ipsEx.push(newIP));
			else ipsEx.push(`'${ip}'`);
		})
		whereIP += `AND \`ip\` NOT IN (${ipsEx.join(',')})`
	}
	Logs.debug(`Getting syslogs for ${header.system}, where: ${whereIP}`);
	const dateQuery = `SELECT * FROM \`syslog\` WHERE time BETWEEN FROM_UNIXTIME(${from}) AND FROM_UNIXTIME(${to}) AND \`system\` = '${header.system}' ${whereIP}; `;

	if (!Config.get('localDataBase')) return {
		'command':'data',
		'data':'syslog',
		'system':header.system,
		'replace':true,
		'logs':[]
	};

	const rows = await SQL.query(dateQuery);

	if (rows.length === 0) {
		return {
			'command':'data',
			'data':'syslog',
			'system':header.system,
			'replace':true,
			'logs':[]
		};
	}

	return {
		'command': 'data',
		'data': 'syslog',
		'system': header.system,
		'replace': true,
		'logs': rows
	};
}

function coreDoRegister(socket, msgObj) {
	const header = msgObj.header;
	if (typeof socket.type == 'undefined') {
		socket.type = header.type;
	}
	if (typeof socket.ID == 'undefined') {
		socket.ID = header.fromID;
	}
	if (typeof socket.version == 'undefined') {
		socket.version = header.version;
	}
	if (typeof socket.prodID == 'undefined') {
		socket.prodID = header.prodID;
	}
	if (header.version !== version) {
		if (header.version.substr(0, header.version.indexOf('.')) != version.substr(0, version.indexOf('.'))) {
			Logs.error('Connected client has different major version, it will not work with this server!');
		} else {
			Logs.warn('Connected client has differnet version, support not guaranteed');
		}
	}
	Logs.debug(`${Logs.g}${header.fromID}${Logs.reset} Registered as new client`);
	socket.connected = true;
}

function makeHeader() {
	const header = {};
	header.fromID = serverID;
	header.timestamp = new Date().getTime();
	header.version = version;
	header.type = 'Server';
	header.active = true;
	header.messageID = header.timestamp;
	header.recipients = [];
	header.system = Config.get('systemName');
	return header;
}

function distributeData(type, data) {
	sendCloudData({'command':'log', 'type':type, 'data':data});
	Server.sendToAll({'command':'log', 'type':type, 'data':data});
}


/* Switch poll functions */


async function lldpLoop(switchType) {
	const Switches = switches(switchType);
	Logs.info(`Getting LLDP neighbors for ${switchType} switches`);
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('neighborRequest', Switches[i]));
	}
	const values = await Promise.all(promisses);
	for (let i = 0; i < values.length; i++) {
		if (values[i] === undefined) {
			Logs.warn(`(LLDP) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`);
			continue;
		}
		switch (Switches[i].OS) {
			case 'NXOS': {
				NXOS.handleLLDP(values[i].result, switchType, Switches[i].Name);
				break;
			}
			case 'EOS': {
				EOS.handleLLDP(values[i].result[1], switchType, Switches[i].Name);
				break;
			}
			default:
				break;
		}
	}
	distributeData('lldp', data.neighbors[switchType]);
}

async function switchFlap(switchType) {
	const Switches = switches(switchType);
	Logs.info('Checking for recent interface dropouts');
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('flapRequest', Switches[i]));
	}
	const values = await Promise.all(promisses);
	const filteredDevices = [];
	for (let i = 0; i < values.length; i++) {
		if (values[i] === 'APIERROR') {
			continue;
		} else if (values[i] === undefined) {
			Logs.warn(`(FLAP) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`);
			continue;
		}
		switch (Switches[i].OS) {
			case 'NXOS': {
				NXOS.handleFlap(filteredDevices, values[i], switchType, Switches[i].Name)
				break;
			}
			case 'EOS': {
				EOS.handleFlap(filteredDevices, values[i], switchType, Switches[i].Name)
				break;
			}
			default:
				break;
		}
	}
	data.mac[switchType] = filteredDevices;
	const type = switchType == 'Media' ? 'mac' : 'mac_control';
	distributeData(type, data.mac[switchType]);
}

function switchPhy(switchType) {
	if (Config.get('devMode')) return;
	const Switches = switches('Media');
	Logs.info('Looking for high numbers of PHY/FEC errors');
	function processSwitchPhy(response, devices) {
		const statuses = response.result[1].interfacePhyStatuses;
		const keys = Object.keys(devices);
		for (let portName in statuses) {
			if (!keys.includes(portName)) {
				devices[portName] = {};
			}
			const port = statuses[portName];
			const fec = port.phyStatuses[0].fec;
			if (fec?.encoding == 'reedSolomon') {
				if (fec.uncorrectedCodewords.value > 100) {
					devices[portName].phy = {};
					devices[portName].phy.current = fec.uncorrectedCodewords.value;
					devices[portName].phy.changes = fec.uncorrectedCodewords.changes;
					devices[portName].phy.lastChange = fec.uncorrectedCodewords.lastChange;
					devices[portName].port = portName;
					devices[portName].description = getDescription(portName, switchType);
				}
			} else if (fec?.encoding == 'fireCode') {
				if (fec.perLaneUncorrectedFecBlocks[0].value > 100) {
					devices[portName].phy = {};
					devices[portName].phy.current = fec.perLaneUncorrectedFecBlocks[0].value;
					devices[portName].phy.changes = fec.perLaneUncorrectedFecBlocks[0].changes;
					devices[portName].phy.lastChange = fec.perLaneUncorrectedFecBlocks[0].lastChange;
					devices[portName].port = portName;
					devices[portName].description = getDescription(portName, switchType);
				}
			}
		}
		return devices;
	}

	let promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('phyRequest', Switches[i]));
	}
	return Promise.all(promisses).then((values) => {
		let filteredDevices = [];
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let procDev = processSwitchPhy(values[i], data.neighbors[switchType][Switches[i].Name]);

				for (let dev in procDev) {
					if ('phy' in procDev[dev]) {
						procDev[dev].switch = Switches[i].Name;
						filteredDevices.push(procDev[dev]);
						//}
					}
				}
			} else {
				Logs.warn(`(PHY) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`);
			}
		}
		data.phy = filteredDevices;
		distributeData('phy', data.phy);
	});
}

async function switchFibre(switchType) {
	const Switches = switches(switchType);
	Logs.info('Looking for low fibre levels in trancievers');
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('transRequest', Switches[i]));
	}
	const values = await Promise.all(promisses);
	const filteredDevices = [];
	for (let i = 0; i < values.length; i++) {
		if (values[i] === undefined) {
			Logs.warn(`(TRANS) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`);
			continue;
		}
		switch (Switches[i].OS) {
			case 'NXOS': {
				NXOS.handleFibre(filteredDevices, values[i], switchType, Switches[i].Name)
				break;
			}
			case 'EOS': {
				EOS.handleFibre(filteredDevices, values[i], switchType, Switches[i].Name)
				break;
			}
			default:
				break;
		}
	}
	data.fibre[switchType] = filteredDevices;
	const type = switchType == 'Media' ? 'fibre' : 'fibre_control';
	distributeData(type, data.fibre[switchType]);
}

async function switchEnv(switchType) {
	const Switches = switches(switchType);
	Logs.info('Checking switch environment paramaters');
	const promissesP = [];
	const promissesT = [];
	const promissesF = [];
	for (let i = 0; i < Switches.length; i++) {
		promissesP.push(doApi('power', Switches[i]));
		promissesT.push(doApi('temperature', Switches[i]));
		promissesF.push(doApi('fans', Switches[i]));
	}
	const valuesP = await Promise.all(promissesP);
	const valuesT = await Promise.all(promissesT);
	const valuesF = await Promise.all(promissesF);
	for (let i = 0; i < Switches.length; i++) {
		if (valuesP[i] === undefined
		|| valuesT[i] === undefined
		|| valuesF[i] === undefined) {
			Logs.warn(`(ENV) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`);
			continue;
		}
		switch (Switches[i].OS) {
			case 'NXOS': {
				NXOS.handlePower(valuesP[i], switchType, Switches[i].Name);
				NXOS.handleTemperature(valuesT[i], switchType, Switches[i].Name);
				NXOS.handleFans(valuesF[i], switchType, Switches[i].Name);
				break;
			}
			case 'EOS': {
				EOS.handlePower(valuesP[i], switchType, Switches[i].Name);
				EOS.handleTemperature(valuesT[i], switchType, Switches[i].Name);
				EOS.handleFans(valuesF[i], switchType, Switches[i].Name);
				break;
			}
			default:
				break;
		}
	}
	const typeP = switchType == 'Media' ? 'power' : 'power_control';
	const typeT = switchType == 'Media' ? 'temperature' : 'temperature_control';
	const typeF = switchType == 'Media' ? 'fans' : 'fans_control';
	distributeData(typeP, data.power[switchType]);
	distributeData(typeT, data.temperature[switchType]);
	distributeData(typeF, data.fans[switchType]);
}

async function switchInterfaces(switchType, monitoringOnly) {
	const Switches = switches(switchType);
	Logs.info('Checking switch interfaces');
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		if (monitoringOnly) promisses.push(doApi('interfacesMonitoring', Switches[i]));
		else promisses.push(doApi('interfaces', Switches[i]));
	}
	const values = await Promise.all(promisses);
	const filteredPorts = {};
	for (let i = 0; i < Switches.length; i++) {
		if (values[i] === undefined) {
			Logs.warn(`(INT) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`);
			continue;
		}
		switch (Switches[i].OS) {
			case 'NXOS': {
				NXOS.handleInterfaces(values[i], switchType, Switches[i].Name);
				break;
			}
			case 'EOS': {
				EOS.handleInterfaces(values[i], switchType, Switches[i].Name);
				break;
			}
			default:
				break;
		}
	}

	const allIfaces = data.interfaces[switchType];

	ports(switchType).forEach(port => {
		try {
			const group = port.Group ? port.Group : 'DEFAULT';
			if (filteredPorts[switchType] === undefined) filteredPorts[switchType] = {};
			if (filteredPorts[switchType][group] === undefined) filteredPorts[switchType][group] = {};
			if (filteredPorts[switchType][group][port.Switch] === undefined) filteredPorts[switchType][group][port.Switch] = {};
			if (Object.keys(data.interfaces[switchType][port.Switch]).includes(port.Port)) {
				filteredPorts[switchType][group][port.Switch][port.Port] = data.interfaces[switchType][port.Switch][port.Port];
			}

			if (!port.Alerts) return;
			const iface = allIfaces[port.Switch][port.Port];
			if (!data.ports[switchType][port.Switch]) data.ports[switchType][port.Switch] = {};
			if (data.ports[switchType][port.Switch][port.Port] != iface.connected && !iface.connected) {
				notification('Port Down', `Port: ${port.Port} - ${getDescription(port.Port, switchType, port.Switch)} on switch: ${port.Switch} is DOWN`);
			}
			data.ports[switchType][port.Switch][port.Port] = iface.connected;
		} catch (error) {
			Logs.warn("Couldn't parse interfaces data", error);
		}

	})

	for (const switchName in allIfaces) {
		if (!Object.hasOwnProperty.call(allIfaces, switchName)) continue;
		const ifaces = allIfaces[switchName];
		for (const ifaceName in ifaces) {
			if (!Object.hasOwnProperty.call(ifaces, ifaceName)) continue;
			if (!Config.get('interfaceWarnings')) continue;
			const iface = ifaces[ifaceName];
			if ((iface.inRate/iface.maxRate > thresholds.bandwidth) || (iface.outRate/iface.maxRate > thresholds.bandwidth)) {
				if (filteredPorts[switchType]['WARNING'] === undefined) filteredPorts[switchType]['WARNING'] = {};
				if (filteredPorts[switchType]['WARNING'][switchName] === undefined) filteredPorts[switchType]['WARNING'][switchName] = {};
				filteredPorts[switchType]['WARNING'][switchName][ifaceName] = iface;
			}
			if ((iface.outDiscards > thresholds.discard) || (iface.inDiscards > thresholds.discard)) {
				if (filteredPorts[switchType]['WARNING'] === undefined) filteredPorts[switchType]['WARNING'] = {};
				if (filteredPorts[switchType]['WARNING'][switchName] === undefined) filteredPorts[switchType]['WARNING'][switchName] = {};
				filteredPorts[switchType]['WARNING'][switchName][ifaceName] = iface;
			}
			if ((iface.outErrors > thresholds.errors) || (iface.inErrors > thresholds.errors)) {
				if (filteredPorts[switchType]['WARNING'] === undefined) filteredPorts[switchType]['WARNING'] = {};
				if (filteredPorts[switchType]['WARNING'][switchName] === undefined) filteredPorts[switchType]['WARNING'][switchName] = {};
				filteredPorts[switchType]['WARNING'][switchName][ifaceName] = iface;
			}
		}
	}

	const type = switchType == 'Media' ? 'interfaces' : 'interfaces_control';
	distributeData(type, filteredPorts[switchType]);
}

function checkUps() {
	if (Config.get('devMode')) return;
	let Ups = ups();
	Logs.info('Getting UPS status');
	function getUpsStatus(ip) {
		return fetch('http://' + ip + '/json/live_data.json?_=' + Math.floor(Math.random() * 10000000), {
			method: 'GET'
		}).then(response => {
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
						autonomy: jsonRpcResponse.authonomy,
						temp: jsonRpcResponse.tsys
					};
				});
			}
		}).catch(error => {
			Logs.warn(`Cannot reach UPS on: ${ip}`, error);
		});
	}

	let promises = [];
	for (let index = 0; index < Ups.length; index++) {
		promises.push(getUpsStatus(Ups[index].IP));
	}

	return Promise.allSettled(promises).then((values) => {
		let filteredUps = [];
		cachedUpsTemps = {};
		for (let i = 0; i < Ups.length; i++) {
			if (values[i].status === 'rejected' || typeof values[i].value == 'undefined') {
				Ups[i].Status = 'Offline';
				if (!Ups[i].linePresent || !Ups[i].outputPowered || Ups[i].load > 80) {
					//filteredUps.push(Ups[i]);
				}
			} else {
				cachedUpsTemps[Ups[i].Name] = values[i].value.temp;
				values[i].value.name = Ups[i].Name;
				delete values[i].value.ip;
				Ups[i] = values[i].value;
				Ups[i].Status = 'Online';
			}
			filteredUps.push(Ups[i]);
		}
		data.ups = filteredUps;
		distributeData('ups', data.ups);
	});
}

function checkDevices(switchType, fromList) {
	Logs.info('Checking device lists for missing devices');
	const Devices = devices();
	const missingDevices = {};
	let expectedDevices = [];
	if (fromList) {
		for (let i in Devices) {
			expectedDevices = [...new Set([...expectedDevices, ...parseTemplateString(Devices[i].name)])];
		}
	} else {
		for (const switchName in data.neighbors[switchType]) {
			const Switch = data.neighbors[switchType][switchName];				
			for (const [port, properties] of Object.entries(Switch)) {
				expectedDevices.push(properties.lldp);
			}
		}
		expectedDevices = [...new Set(expectedDevices)].filter(Boolean);
	}

	for (const Switch in data.neighbors[switchType]) {
		if (!Object.hasOwnProperty.call(data.neighbors[switchType], Switch)) continue;
		const lldpNeighborsObj = data.neighbors[switchType][Switch];
		const lldpNeighbors = [];
		for (let port in lldpNeighborsObj) {
			const Neighbor = lldpNeighborsObj[port];
			if (Neighbor.lldp) lldpNeighbors.push(Neighbor.lldp);
		}
		const missingSwitchDevices = expectedDevices.filter(x => !lldpNeighbors.includes(x));
		for (let index = 0; index < missingSwitchDevices.length; index++) {
			const device = missingSwitchDevices[index];
			if (device == undefined || device == "") continue;
			if (missingDevices[device] === undefined) missingDevices[device] = [];
			missingDevices[device].push(Switch);
		}
	}
	data.devices[switchType] = missingDevices;
	const type = switchType == 'Media' ? 'devices' : 'devices_control';
	distributeData(type, data.devices[switchType]);
}

function checkEmbrionix() {
	Logs.info('Checking Embrionix\'s Fiber Levels');
	const Devices = devices();

	Devices.forEach(async (device) => {
		if (device.deviceType != 'Embrionix') return;
		
		const response = await fetch(`http://${device.IP}/emsfp/node/v1/telemetry/ports`);

		if (response.status !== 200) {
			Logs.warn(`Failed to connect to Embrionix device at ${device.IP}, status code: ${response.status}`);
			return;
		};

		const body = await response.json();

		const ports = body.ports;
		const red = ports[2];
		const blue = ports[4];

		// mw to dBw : 10*log10( mw / 1000)
		
		red.txPowerdB = mwTodBw(red.tx_power);
		red.rxPowerdB = mwTodBw(red.rx_power);

		blue.txPowerdB = mwTodBw(blue.tx_power);
		blue.rxPowerdB = mwTodBw(blue.rx_power);

		if (data.embrionix == undefined) data.embrionix = {};

	});

	

}

function mwTodBw(mw) {
	if(parseInt(mw) == null) {
		return null;
	}

	return (10 * Math.log10(mw / 1000)).toFixed(2);
}


async function doApi(request, Switch) {
	const ip = Switch.IP;
	const user = Switch.User;
	const pass = Switch.Pass;
	const OS = Switch.OS;
	let endPoint = '';
	let protocol = 'http';
	if (!SwitchRequests[OS][request]) return;

	let command = SwitchRequests[OS][request];

	if (request == "interfacesMonitoring") {
		const portsArray = [];
		ports(Switch.Type).forEach(port => {
			if (port.Switch == Switch.Name) portsArray.push(port.Port);
		})
		command += ' ';
		command += portsArray.join(',');
	}

	const body = {
		'NXOS': {
			"jsonrpc": "2.0",
			"method": "cli",
			"params": {
				"cmd": command,
				"version": 1
			},
			"id": 1
		},
		'EOS': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					command
				],
				'version': 1
			},
			'id': ''
		}
	}

	const options = {
		method: 'POST',
		headers: {
			'content-type': 'application/json-rpc',
			'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
		},
		body: JSON.stringify(body[OS]),
	}

	switch (OS) {
		case 'EOS':
			endPoint = 'command-api'
			protocol = 'http';
			break;
		case 'NXOS':
			endPoint = 'ins'
			protocol = 'https';
			options.agent = httpsAgent;
			break;
		default:
			break;
	}
	Logs.debug(`Polling switch API endpoint ${protocol}://${ip}/${endPoint} for ${request} data`);

	try {		
		const response = await fetch(`${protocol}://${ip}/${endPoint}`, options);
		if (response.status !== 200) throw new Error(`Error connection to server, repsonse code: ${response.status}`);
		const jsonRpcResponse = await response.json();
		if (jsonRpcResponse.error) {
			jsonRpcResponse.error.data[1].errors.push('Command: '+command);
			jsonRpcResponse.error.data[1].errors.push('Switch: '+Switch.Name);
			Logs.warn('Issue with API request, try updating the swtich', jsonRpcResponse.error.data[1].errors);
			return 'APIERROR';
		}
		return jsonRpcResponse
	} catch (error) {
		Logs.error(`Failed to connect to switch on: ${ip}`, error,);
	}
}


/* Control Functions */

function localPings() {
	if (Config.get('devMode')) return;
	const hosts = pings();
	hosts.forEach(async host => {
		const response = await ping.promise.probe(host.IP, {
			timeout: 10,
			extra: ['-i', '2']
		})
		Logs.info(`IP: ${host.IP}, Online: ${response.alive}`);
		if (!response.alive && host.TripleCheck) {
			await sleep(2);
			const recheckOne = await ping.promise.probe(host.IP, {
				timeout: 10,
				extra: ['-i', '2']
			})
			if (recheckOne.alive) response.alive = true;
			else {
				await sleep(2);
				const recheckTwo = await ping.promise.probe(host.IP, {
					timeout: 10,
					extra: ['-i', '2']
				})
				if (recheckTwo.alive) response.alive = true;
			}
		}
		if (!localPingsData[host.IP]) localPingsData[host.IP] = {'lastChange': Date.now()};
		if (localPingsData[host.IP].status != response.alive) {
			localPingsData[host.IP].lastChange = Date.now();
			localPingsData[host.IP].status = response.alive;
			if (!response.alive && host.Alert) notification("Device Offline", `Device ${host.Name} being pinged at address ${host.IP} has gone offline`);
		}
		distributeData('localPing', {
			'status':response.alive,
			'IP':host.IP,
			'Name':host.Name,
			'Group':host.Group,
			'SSH':host.SSH,
			'HTTP':host.HTTP,
			'HTTPS':host.HTTPS,
			'lastChange': localPingsData[host.IP].lastChange
		});
	});
}


/* Web Logging Functions */


async function logTemp() {
	if (Config.get('devMode')) return;
	let Temps = temps();
	Logs.info('Getting temperatures');

	doIQTemps(Temps.filter(sensor => sensor.Type == 'IQ Frame'));
	doGenericTemps(Temps.filter(sensor => sensor.Type == 'Will N Sensor'));
}

async function doIQTemps(Temps) {
	let promises = [];

	for (let index = 0; index < Temps.length; index++) {
		const sensor = Temps[index];
		try {
			const response = await fetch('http://'+sensor.IP);
			promises.push(response.text());
		} catch (error) {
			Logs.warn(`Cannot reach sensor on: ${sensor.IP}`, error);
		}
	}

	if (promises.length < 1) return;
	const results = await Promise.allSettled(promises);
	Logs.debug('Got temperature data, processing');
	let tempSum = 0;
	let tempValid = 0;
	const socketSend = {};

	for (let index = 0; index < Temps.length; index++) {
		const sensorData = results[index];

		if (sensorData?.status == 'fulfilled') {
			try {
				let temp = 0;
				const sensorStatData = sensorData.value.split('<p><b>Temperature In:</b></p>');
				if (typeof sensorStatData[1] == 'undefined') return;
				const sensorStat = sensorStatData[1].slice(25,27);
				if (sensorStat == 'OK') {
					let unfilteredTemp = sensorData.value.split('<p><b>Temperature In:</b></p>')[1].slice(29,33);
					temp = parseInt(unfilteredTemp.substring(0, unfilteredTemp.indexOf(')')));
				} else {
					Logs.warn(`${Temps[index].Name} sensor temperature is not OK`);
				}
				Temps[index].Temp = temp;
				tempSum += temp;
				tempValid++;
				Logs.debug(`${Temps[index].Name} temperature = ${temp} deg C`);
				if (Config.get('localDataBase')) SQL.insert({
					'sensor': Temps[index].Name,
					'sensorType': 'IQ Frame',
					'temperature': Temps[index].Temp,
					'system': Config.get('systemName')
				}, 'temperature');
				socketSend[Temps[index].Name] = Temps[index].Temp;
			} catch (error) {
				Logs.warn(`Error processing data from: '${Temps[index].Name}'`, error);
			}
		} else {
			Logs.warn(`Can't connect to sensor: '${Temps[index].Name}'`);
		}
	}

	let tempAvg;

	if (tempValid == 0) {
		Logs.error('Invalid temperature measured connections must have failed');
		sendSms('Cannot connect to sensor, it haseither failed or the network is broken');
	} else {
		tempAvg = tempSum / tempValid;
		Logs.debug(`Average temperature = ${tempAvg} deg C`);
		Logs.debug(`Warning temperature = ${Config.get('warningTemperature')} deg C`);

		if (tempAvg > Config.get('warningTemperature')) {
			Logs.warn('Warning: Temperature over warning limit, sending SMS');
			sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`);
		}
		sendCloudData({'command':'log', 'type':'temperature', 'data':Temps});

		socketSend.average = tempAvg;
		const time = new Date().getTime();
		const points = {};
		points[time] = socketSend;
		Server.sendToAll({
			'command': 'data',
			'data': 'temps',
			'type': 'IQ Frame',
			'system': Config.get('systemName'),
			'replace': false,
			'points': points
		});
	}
}

async function doGenericTemps(Temps) {
	let promises = [];

	for (let index = 0; index < Temps.length; index++) {
		const sensor = Temps[index];
		try {
			const response = await fetch('http://'+sensor.IP+'/temps');
			promises.push(response.text());
		} catch (error) {
			Logs.warn(`Cannot reach sensor on: ${sensor.IP}`, error);
		}
	}

	const cachedTemps = Object.keys(cachedUpsTemps)
	if (promises.length < 1 && cachedTemps.length < 1) return;

	const results = await Promise.allSettled(promises);
	Logs.debug('Got temperature data, processing');
	let tempSum = 0;
	let tempValid = 0;
	const webTemps = [];
	const socketSend = {};

	for (let index = 0; index < Temps.length; index++) {
		const sensorData = results[index];

		if (sensorData.status == 'fulfilled') {
			const sensors = JSON.parse(sensorData.value);
			for (let sensorNum = 0; sensorNum < sensors.Sensors; sensorNum++) {
				const sensor = sensors[`Sensor${sensorNum+1}`];
				try {				
					webTemps.push({
						'Temp': Number(sensor.Temperature),
						'Name': sensor.Location,
						'IP': Temps[index].IP,
						'Type': 'Will N Sensor'
					})
					tempSum += Number(sensor.Temperature);
					tempValid++;
					Logs.debug(`${sensor.Location} temperature = ${Number(sensor.Temperature)} deg C`);
					if (Config.get('localDataBase')) SQL.insert({
						'sensor': sensor.Location,
						'sensorType': 'Will N Sensor',
						'temperature': Number(sensor.Temperature),
						'system': Config.get('systemName')
					}, 'temperature');
					socketSend[sensor.Location] = Number(sensor.Temperature);
				} catch (error) {
					Logs.warn(`Error processing data for from: '${sensor.Location}'`, error);
				}
			}
		} else {
			Logs.warn(`Can't connect to sensor: '${Temps[index].Name}'`);
		}
	}

	cachedTemps.forEach(upsName => {
		tempValid++;
		Logs.debug(`${upsName} temperature = ${Number(cachedUpsTemps[upsName])} deg C`);
		if (Config.get('localDataBase')) SQL.insert({
			'sensor': upsName,
			'sensorType': 'Will N Sensor',
			'temperature': Number(cachedUpsTemps[upsName]),
			'system': Config.get('systemName')
		}, 'temperature');
		socketSend[upsName] = Number(cachedUpsTemps[upsName]);
		webTemps.push({
			'Temp': Number(cachedUpsTemps[upsName]),
			'Name': upsName,
			'IP': '0.0.0.0',
			'Type': 'Will N Sensor'
		})
	})

	let tempAvg;

	if (tempValid == 0) {
		Logs.error('Invalid temperature measured connections must have failed');
		sendSms('Cannot connect to sensor, it haseither failed or the network is broken');
	} else {
		tempAvg = tempSum / tempValid;
		Logs.debug(`Average temperature = ${tempAvg} deg C`);
		Logs.debug(`Warning temperature = ${Config.get('warningTemperature')} deg C`);

		if (tempAvg > Config.get('warningTemperature')) {
			Logs.warn('Warning: Temperature over warning limit, sending SMS');
			sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`);
		}
		sendCloudData({'command':'log', 'type':'temperature', 'data':webTemps});

		socketSend.average = tempAvg;
		const time = new Date().getTime();
		const points = {};
		points[time] = socketSend;
		Server.sendToAll({
			'command': 'data',
			'data': 'temps',
			'type': 'Will N Sensor',
			'system': Config.get('systemName'),
			'replace': false,
			'points': points
		});
	}
}

function webLogPing() {
	if (!Config.get('webEnabled')) return;
	Logs.info('Pinging webserver');
	sendCloudData({'command':'log', 'type':'ping'});
}

function webLogBoot() {
	if (!Config.get('webEnabled')) return;
	Logs.info('Sending boot');
	sendCloudData({'command':'log', 'type':'boot'});
}

function sendSms(msg) {
	if (!Config.get('textsEnabled')) return;

	let params = {
		Message: msg,
		TopicArn: 'arn:aws:sns:eu-west-2:796884558775:TDS_temperature'
	};

	let promise = new AWS.SNS({ apiVersion: '2010-03-31' }).publish(params).promise();
	promise.then(function (data) {
		Logs.log(`Text message sent - messageId: ${data.MessageId}`);
	}).catch(function (err) {
		Logs.error(err, err.stack);
	});
}

async function connectToWebServer(retry = false) {	
	if(!Config.get('webEnabled')) return;
	let inError = false;
	let promise;

	if (cloudServer.address !== Config.get('webSocketEndpoint')) {
		cloudServer.address = Config.get('webSocketEndpoint');
		cloudServer.conneceted = false;
		if (typeof cloudServer.socket !== 'undefined') cloudServer.socket.close();
		delete cloudServer.socket;
	}

	if ((!cloudServer.connected && cloudServer.active && cloudServer.attempts < 3) || (retry && !cloudServer.connected)) {
		const protocol = Config.get('secureWebSocketEndpoint') ? 'wss' : 'ws';
		if (retry) {
			Logs.warn(`Retrying connection to dead server: ${Logs.r}${protocol}://${cloudServer.address}${Logs.reset}`);
		}
		cloudServer.socket = new WebSocket(`${protocol}://${cloudServer.address}`);

		promise = new Promise(resolve=>{
			cloudServer.socket.on('open', function open() {
				let payload = {};
				payload.command = 'register';
				payload.name = Config.get('systemName');
				sendCloudData(payload);
				resolve();
				Logs.log(`${Logs.g}${cloudServer.address}${Logs.reset} Established a connection to webserver`, 'S');
				cloudServer.connected = true;
				cloudServer.active = true;
				cloudServer.attempts = 0;
			});
		});

		cloudServer.socket.on('message', function message(msgJSON) {
			try {
				const msgObj = JSON.parse(msgJSON);
				if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
					Logs.info('Received from other server', msgObj);
				} else if (Config.get('printPings') == true) {
					Logs.info('Received from other server', msgObj);
				}
				switch (msgObj.payload.command) {
				case 'ping':
					sendCloudData({
						'command': 'pong'
					});
					break;
				case 'data':
					Logs.debug('Recieved temp/ping data from server');
					break;
				default:
					Logs.warn('Received unknown from other server', msgObj);
				}
			} catch (e) {
				try {
					const msgObj = JSON.parse(msgJSON);
					if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
						Logs.info('Received from other server', msgObj);
					} else if (Config.get('printPings') == true) {
						Logs.info('Received from other server', msgObj);
					}
					if (typeof msgObj.type == 'undefined') {
						let stack = e.stack.toString().split(/\r\n|\n/);
						stack = JSON.stringify(stack, null, 4);
						Logs.error(`Server error, stack trace: ${stack}`);
					} else {
						Logs.error('A device is using old \'chiltv\' data format, upgrade it to v4.0 or above');
					}
				} catch (e2) {
					Logs.error('Invalid JSON from other server', e);
					Logs.info('Received from other server', JSON.parse(msgJSON));
				}
			}
		});

		cloudServer.socket.on('close', function close() {
			cloudServer.connected = false;
			delete cloudServer.socket;
			cloudServer.attempts++;
			if (!inError) {
				Logs.warn(`${Logs.r}${cloudServer.address}${Logs.reset} Outbound webserver connection closed`);
			}
		});

		cloudServer.socket.on('error', function error() {
			inError = true;
			Logs.error(`Could not connect to server: ${Logs.r}${cloudServer.address}${Logs.reset}`);
		});
		
	} else if (!cloudServer.connected && cloudServer.active) {
		cloudServer.active = false;
		Logs.error(`Server not responding, changing status to dead: ${Logs.r}${cloudServer.address}${Logs.reset}`);
	}
	return promise;
}

function sendCloudData(payload) {
	if (!Config.get('webEnabled')) return;
	let packet = {};
	packet.header = makeHeader();
	packet.payload = payload;
	if (cloudServer.connected) {
		cloudServer.socket.send(JSON.stringify(packet));
	}
}

/* Utility Functions */


function parseTemplateString(string) {

	function paternDecompose(patern) {
		const paternArray = patern.split(',');
		const outputArray = [];
		for (let index = 0; index < paternArray.length; index++) {
			const element = paternArray[index];
			if (element.includes('-')) {
				const [from, to] = element.split('-');
				for (let index = Number(from); index <= Number(to); index++) {
					outputArray.push(index);
				}
			} else {
				outputArray.push(element);
			}
		}
		return outputArray.sort((a,b)=>a[1]-b[1]);
	}

	string = `#${string}#`;
	const loopable = string.split(/{(.*?)}/g);
	let returnArray = [loopable.shift().substring(1)];
	const loopLength = loopable.length;
	if (loopLength == 0) {
		returnArray[0] = returnArray[0].slice(0, -1);
	}
	for (let index = 0; index < loopLength; index++) {
		const text = (index == loopLength - 2) ? loopable[index + 1].slice(0, -1) : loopable[index + 1];
		const paternArray = paternDecompose(loopable[index]);

		const newReturnArray = [];
		returnArray.forEach(existingElement => {
			paternArray.forEach(paternElement => {
				newReturnArray.push(existingElement+paternElement+text);
			});
		});
		returnArray = newReturnArray;
		index++;
	}
	return returnArray;
}

function getDescription(portName, switchType, switchName) {
	if (data.interfaces[switchType][switchName][portName]) {
		return data.interfaces[switchType][switchName][portName].description;
	} else {
		return undefined;
	}
}

function minutes(mins) {
	return parseInt(mins) * 60;
}

function clearEmpties(object) {
	for (let key in object) {
		if (!object[key] || typeof object[key] !== 'object') continue;
		clearEmpties(object[key]);
		if (Object.keys(object[key]).length === 0) delete object[key];
	}
	return object;
}

async function startLoopAfterDelay(callback, seconds, ...args) {
	setInterval(callback, seconds * 1000, ...args);
	callback(...args);
	Logs.info('Starting '+callback.name);
	await sleep(1);
}

async function sleep(seconds) {
	await new Promise (resolve => setTimeout(resolve, 1000*seconds));
}