/* eslint-disable no-unused-vars */
const serverID = new Date().getTime();

const {WebSocket} = require('ws');
const express = require('express');
const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const {log, logObj, logs, logEvent} = require('xeue-logs');
const {config} = require('xeue-config');
const {SQLSession} = require('xeue-sql');
const {Server} = require('xeue-webserver');
const {app, BrowserWindow, ipcMain, Tray, Menu} = require('electron');
const {version} = require('./package.json');
const electronEjs = require('electron-ejs');
const AutoLaunch = require('auto-launch');
const ping = require('ping');
const https = require('https');

const httpsAgent = new https.Agent({
	rejectUnauthorized: false,
});

const __static = __dirname+'/static';

const ejs = new electronEjs({'static': __static}, {});

Array.prototype.symDiff = function(x) {
	return this.filter(y => !x.includes(y)).concat(x => !y.includes(x));
}

Array.prototype.diff = function(x) {
	return this.filter(y => !x.includes(y));
}

/* Data Defines */

const fibreRequest = {
	'jsonrpc': '2.0',
	'method': 'runCmds',
	'params': {
		'format': 'json',
		'timestamps': false,
		'autoComplete': false,
		'expandAliases': false,
		'cmds': [
			'show interfaces transceiver'
		],
		'version': 1
	},
	'id': 'EapiExplorer-1'
};
const lldpRequest = {
	'jsonrpc': '2.0',
	'method': 'runCmds',
	'params': {
		'format': 'json',
		'timestamps': false,
		'autoComplete': false,
		'expandAliases': false,
		'cmds': [
			'enable',
			'show lldp neighbors'
		],
		'version': 1
	},
	'id': ''
};
const macRequest = {
	'jsonrpc': '2.0',
	'method': 'runCmds',
	'params': {
		'format': 'text',
		'timestamps': false,
		'autoComplete': false,
		'expandAliases': false,
		'cmds': [
			'enable',
			'show interfaces mac'
		],
		'version': 1
	},
	'id': ''
};
const phyRequest = {
	'jsonrpc': '2.0',
	'method': 'runCmds',
	'params': {
		'format': 'json',
		'timestamps': false,
		'autoComplete': false,
		'expandAliases': false,
		'cmds': [
			'enable',
			'show interfaces phy detail'
		],
		'version': 1
	},
	'id': ''
};
const data = {
	'neighbors': {},
	'fibre':{},
	'phy': {},
	'mac': {},
	'ups': {},
	'devices':{},
	'controlNeighbors':{}
};
const cloudServer = {
	'connected': false,
	'active': false,
	'attempts': 0
};
const tables = [{
	name: 'temperature',
	definition: `CREATE TABLE \`temperature\` (
		\`PK\` int(11) NOT NULL,
		\`frame\` text NOT NULL,
		\`temperature\` float NOT NULL,
		\`system\` text NOT NULL,
		\`time\` timestamp NOT NULL DEFAULT current_timestamp(),
		PRIMARY KEY (\`PK\`)
	)`,
	PK:'PK'
}];

const SwitchRequests = {
	'NX-OS': {
		'neighborRequest': {
			"jsonrpc": "2.0",
			"method": "cli",
			"params": {
				"cmd": "show cdp neighbors",
				"version": 1
			},
			"id": 1
		}
	},
	'EOS': {
		'neighborRequest': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					'show lldp neighbors'
				],
				'version': 1
			},
			'id': ''
		},
		'transRequest': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'show interfaces transceiver'
				],
				'version': 1
			},
			'id': 'EapiExplorer-1'
		},
		'macRequest': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'text',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					'show interfaces mac'
				],
				'version': 1
			},
			'id': ''
		},
		'phyRequest': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					'show interfaces phy detail'
				],
				'version': 1
			},
			'id': ''
		}
	}
}

const pingFrequency = 30;
const lldpFrequency = 30;
const switchStatsFrequency = 30;
const upsFrequency = 30;
const devicesFrequency = 30;
const tempFrequency = minutes(5);
const localPingFrequency = 10;

/* Globals */

let isQuiting = false;
let mainWindow = null;
let webServer;
let serverHTTP;
let serverWS;
let SQL;
let configLoaded = false;
const devEnv = app.isPackaged ? './' : './';
const __main = path.resolve(__dirname, devEnv);


/* Start App */

(async () => {

	await app.whenReady();
	await setUpApp();
	await createWindow();

	{ /* Config */
		logs.printHeader('Argos Monitoring');
		config.useLogger(logs);
		config.require('port', [], 'What port shall the server use');
		config.require('systemName', [], 'What is the name of the system');
		config.require('warningTemperature', [], 'What temperature shall alerts be sent at');
		config.require('webEnabled', {true: 'Yes', false: 'No'}, 'Should this system report back to an argos server');
		{
			config.require('webSocketEndpoint', [], 'What is the url of the argos server', ['webEnabled', true]);
			config.require('secureWebSocketEndpoint', {true: 'Yes', false: 'No'}, 'Does the server use SSL (padlock in browser)', ['webEnabled', true]);
		}
		config.require('localDataBase', {true: 'Yes', false: 'No'}, 'Setup and use a local database to save warnings and temperature information');
		{
			config.require('dbUser', [], 'Database Username', ['localDataBase', true]);
			config.require('dbPass', [], 'Database Password', ['localDataBase', true]);
			config.require('dbPort', [], 'Database port', ['localDataBase', true]);
			config.require('dbHost', [], 'Database address', ['localDataBase', true]);
			config.require('dbName', [], 'Database name', ['localDataBase', true]);
		}
		config.require('textsEnabled', {true: 'Yes', false: 'No'}, 'Use AWS to send texts when warnings are triggered');
		{
			config.require('awsAccessKeyId', [], 'AWS access key for texts', ['textsEnabled', true]);
			config.require('awsSecretAccessKey', [], 'AWS Secret access key for texts', ['textsEnabled', true]);
			config.require('awsRegion', [], 'AWS region', ['textsEnabled', true]);
		}
		config.require('loggingLevel', {'A':'All', 'D':'Debug', 'W':'Warnings', 'E':'Errors'}, 'Set logging level');
		config.require('createLogFile', {true: 'Yes', false: 'No'}, 'Save logs to local file');
		config.require('advancedConfig', {true: 'Yes', false: 'No'}, 'Show advanced config settings');
		{
			config.require('debugLineNum', {true: 'Yes', false: 'No'}, 'Print line numbers', ['advancedConfig', true]);
			config.require('printPings', {true: 'Yes', false: 'No'}, 'Print pings', ['advancedConfig', true]);
			config.require('devMode', {true: 'Yes', false: 'No'}, 'Dev mode - Disables connections to devices', ['advancedConfig', true]);
		}

		config.default('port', 8080);
		config.default('systemName', 'Unknown');
		config.default('warningTemperature', 35);
		config.default('webEnabled', false);
		config.default('localDataBase', false);
		config.default('dbPort', '3306');
		config.default('dbName', 'argosdata');
		config.default('dbHost', 'localhost');
		config.default('textsEnabled', false);
		config.default('loggingLevel', 'W');
		config.default('createLogFile', true);
		config.default('debugLineNum', false);
		config.default('printPings', false);
		config.default('advancedConfig', false);
		config.default('devMode', false);
		config.default('secureWebSocketEndpoint', true);

		if (!await config.fromFile(path.join(app.getPath('documents'), 'ArgosData', 'config.conf'))) {
			await config.fromAPI(path.join(app.getPath('documents'), 'ArgosData', 'config.conf'), configQuestion, configDone);
		}

		if (config.get('loggingLevel') == 'D' || config.get('loggingLevel') == 'A') {
			config.set('debugLineNum', true);
		}

		if (config.get('textsEnabled')) {
			AWS.config.update({ region: config.get('awsRegion')});
			AWS.config.credentials = new AWS.Credentials(config.get('awsAccessKeyId'), config.get('awsSecretAccessKey'));
		}

		logs.setConf({
			'createLogFile': config.get('createLogFile'),
			'logsFileName': 'ArgosLogging',
			'configLocation': path.join(app.getPath('documents'), 'ArgosData'),
			'loggingLevel': config.get('loggingLevel'),
			'debugLineNum': config.get('debugLineNum'),
		});
		log('Running version: v'+version, ['H', 'SERVER', logs.g]);
		log(`Logging to: ${path.join(app.getPath('documents'), 'ArgosData', 'logs')}`, ['H', 'SERVER', logs.g]);
		log(`Config saved to: ${path.join(app.getPath('documents'), 'ArgosData', 'config.conf')}`, ['H', 'SERVER', logs.g]);
		config.print();
		config.userInput(async command => {
			switch (command) {
			case 'config':
				await config.fromCLI(path.join(app.getPath('documents'), 'ArgosData', 'config.conf'));
				if (config.get('loggingLevel') == 'D' || config.get('loggingLevel') == 'A') {
					config.set('debugLineNum', true);
				}
				logs.setConf({
					'createLogFile': config.get('createLogFile'),
					'logsFileName': 'ArgosLogging',
					'configLocation': path.join(app.getPath('documents'), 'ArgosData'),
					'loggingLevel': config.get('loggingLevel'),
					'debugLineNum': config.get('debugLineNum')
				});
				return true;
			}
		});
		configLoaded = true;
	}

	SQL = new SQLSession(
		config.get('dbHost'),
		config.get('dbPort'),
		config.get('dbUser'),
		config.get('dbPass'),
		config.get('dbName'),
		logs
	);
	await SQL.init(tables);
	
	webServer = new Server(
		config.get('port'),
		expressRoutes,
		logs,
		version,
		config,
		doMessage
	);
	log(`Argos can be accessed at http://localhost:${config.get('port')}`, 'C');

	[serverHTTP, serverWS] = webServer.start();
	mainWindow.webContents.send('loaded', `http://localhost:${config.get('port')}`);

	connectToWebServer(true).then(()=>{
		webLogBoot();
	});

	// 1 Minute ping loop
	setInterval(() => {
		connectToWebServer(true);
	}, 60*1000);
	
	await startLoopAfterDelay(localPings, localPingFrequency);
	await startLoopAfterDelay(connectToWebServer, 5);
	await startLoopAfterDelay(webLogPing, pingFrequency);
	await startLoopAfterDelay(lldpLoop, lldpFrequency);
	await startLoopAfterDelay(controlLoop, lldpFrequency);
	await startLoopAfterDelay(checkDevices, devicesFrequency);
	await startLoopAfterDelay(switchMac, switchStatsFrequency);
	await startLoopAfterDelay(switchPhy, switchStatsFrequency);
	await startLoopAfterDelay(switchFibre, switchStatsFrequency);
	await startLoopAfterDelay(checkUps, upsFrequency);
	await startLoopAfterDelay(logTemp, tempFrequency);
})().catch(error => {
	console.log(error);
});


/* Electron */


async function setUpApp() {
	const tray = new Tray(path.join(__static, 'img/icon/network-96.png'));
	tray.setContextMenu(Menu.buildFromTemplate([
		{
			label: 'Show App', click: function () {
				mainWindow.show();
			}
		},
		{
			label: 'Exit', click: function () {
				isQuiting = true;
				app.quit();
			}
		}
	]));

	ipcMain.on('window', (event, message) => {
		switch (message) {
		case 'exit':
			app.quit();
			break;
		case 'minimise':
			mainWindow.hide();
			break;
		default:
			break;
		}
	});

	ipcMain.on('config', (event, message) => {
		switch (message) {
		case 'start':
			config.fromAPI(path.join(app.getPath('documents'), 'ArgosData','config.conf'), configQuestion, configDone);
			break;
		case 'stop':
			log('Not implemeneted yet: Cancle config change');
			break;
		case 'show':
			config.print();
			break;
		default:
			break;
		}
	});

	const autoLaunch = new AutoLaunch({
		name: 'Argos Monitoring',
		isHidden: true,
	});
	autoLaunch.isEnabled().then(isEnabled => {
		if (!isEnabled) autoLaunch.enable();
	});

	app.on('before-quit', function () {
		isQuiting = true;
	});

	app.on('activate', async () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});

	logEvent.on('logSend', message => {
		if (!isQuiting) mainWindow.webContents.send('log', message);
	});
}

async function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 720,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			preload: path.resolve(__main, 'preload.js')
		},
		icon: path.join(__static, 'img/icon/icon.png'),
		show: false,
		frame: false,
		titleBarStyle: 'hidden',
		titleBarOverlay: {
			color: '#313d48',
			symbolColor: '#ffffff',
			height: 56
		}
	});

	if (!app.commandLine.hasSwitch('hidden')) {
		mainWindow.show();
	} else {
		mainWindow.hide();
	}

	mainWindow.on('close', function (event) {
		if (!isQuiting) {
			event.preventDefault();
			mainWindow.webContents.send('requestExit');
			event.returnValue = false;
		}
	});

	mainWindow.on('minimize', function (event) {
		event.preventDefault();
		mainWindow.hide();
	});

	mainWindow.loadURL(path.resolve(__main, 'views/app.ejs'));

	await new Promise(resolve => {
		ipcMain.on('ready', (event, ready) => {
			if (configLoaded) {
				mainWindow.webContents.send('loaded', `http://localhost:${config.get('port')}`);
			}
			resolve();
		});
	});
}


/* Data */


function loadData(file) {
	try {
		const dataRaw = fs.readFileSync(`${app.getPath('documents')}/ArgosData/data/${file}.json`);
		try {
			return JSON.parse(dataRaw);
		} catch (error) {
			logObj(`There is an error with the syntax of the JSON in ${file}.json file`, error, 'E');
			return [];
		}
	} catch (error) {
		log(`Cloud not read the file ${file}.json, attempting to create new file`, 'W');
		logs.debug('File error:', error);
		const fileData = [];
		switch (file) {
		case 'Devices':
			fileData[0] = {
				'name':'Placeholder',
				'description':'Placeholder'
			};
			break;
		case 'Switches':
			fileData[0] = {
				'Name':'Placeholder',
				'User': 'Username',
				'Pass': 'Password',
				'IP':'0.0.0.0',
				'Type': 'Media',
				'OS': 'Media'
			};
			break;
		default:
			fileData[0] = {
				'Name':'Placeholder',
				'IP':'0.0.0.0'
			};
			break;
		}
		if (!fs.existsSync(`${app.getPath('documents')}/ArgosData/data/`)){
			fs.mkdirSync(`${app.getPath('documents')}/ArgosData/data/`);
		}
		fs.writeFileSync(`${app.getPath('documents')}/ArgosData/data/${file}.json`, JSON.stringify(fileData, null, 4));
		return fileData;
	}
}
function writeData(file, data) {
	try {
		fs.writeFileSync(`${app.getPath('documents')}/ArgosData/data/${file}.json`, JSON.stringify(data, undefined, 2));
	} catch (error) {
		logObj(`Cloud not write the file ${file}.json, do we have permission to access the file?`, error, 'E');
	}
}

function switches(type) {
	const Switches = loadData('Switches');
	if (type !== undefined) return Switches.filter(Switch => Switch.Type == type);
	return Switches;
}
function frames() {
	return loadData('Frames');
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


/* Express setup & Websocket Server */


function expressRoutes(expressApp) {
	expressApp.set('views', path.join(__main, 'views'));
	expressApp.set('view engine', 'ejs');
	expressApp.use(express.json());
	expressApp.use(express.static(__static));

	expressApp.get('/',  (req, res) =>  {
		log('New client connected', 'A');
		res.header('Content-type', 'text/html');
		res.render('web', {
			switches:switches('Media'),
			systemName:config.get('systemName'),
			webSocketEndpoint:config.get('webSocketEndpoint'),
			secureWebSocketEndpoint:config.get('secureWebSocketEndpoint'),
			webEnabled:config.get('webEnabled'),
			version: version
		});
	});

	expressApp.get('/broken', (req, res) => {
		res.send('no');
	});

	expressApp.get('/fibre', (req, res) => {
		log('Request for fibre data', 'D');
		res.send(JSON.stringify(data.fibre));
	});

	expressApp.get('/ups', (req, res) => {
		log('Request for UPS data', 'D');
		res.send(JSON.stringify(data.ups));
	});

	expressApp.get('/phy', (req, res) => {
		log('Request for PHY/FEC data', 'D');
		res.send(JSON.stringify(data.phy));
	});

	expressApp.get('/mac', (req, res) => {
		log('Request for mac/flap data', 'D');
		res.send(JSON.stringify(data.mac));
	});

	expressApp.get('/devices', (req, res) => {
		log('Request for devices data', 'D');
		res.send(JSON.stringify(data.devices));
	});

	expressApp.get('/getConfig', (req, res) => {
		log('Request for devices config', 'D');
		let catagory = req.query.catagory;
		let data;
		switch (catagory) {
		case 'switches':
			data = switches();
			break;
		case 'frames':
			data = frames();
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

	expressApp.post('/setswitches', (req, res) => {
		log('Request to set switches config data', 'D');
		writeData('Switches', req.body);
		res.send('Done');
	});
	expressApp.post('/setdevices', (req, res) => {
		log('Request to set devices config data', 'D');
		writeData('Devices', req.body);
		res.send('Done');
	});
	expressApp.post('/setups', (req, res) => {
		log('Request to set ups config data', 'D');
		writeData('Ups', req.body);
		res.send('Done');
	});
	expressApp.post('/setframes', (req, res) => {
		log('Request to set frames config data', 'D');
		writeData('Frames', req.body);
		res.send('Done');
	});
	expressApp.post('/setpings', (req, res) => {
		log('Request to set pings config data', 'D');
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
		logObj('Received', msgObj, 'D');
		socket.send('Received meta');
		break;
	case 'register':
		coreDoRegister(socket, msgObj);
		break;
	case 'get':
		getTemperature(header, payload).then(data => {
			webServer.sendTo(socket, data);
		});
		break;
	default:
		logObj('Unknown message', msgObj, 'W');
	}
}

async function getTemperature(header, payload) {
	log(`Getting temps for ${header.system}`, 'D');
	const from = payload.from;
	const to = payload.to;
	const dateQuery = `SELECT ROW_NUMBER() OVER (ORDER BY PK) AS Number, \`PK\`, \`time\` FROM \`temperature\` WHERE time BETWEEN FROM_UNIXTIME(${from}) AND FROM_UNIXTIME(${to}) AND \`system\` = '${header.system}' GROUP BY \`time\`; `;

	if (!config.get('localDataBase')) return {
		'command':'data',
		'data':'temps',
		'system':header.system,
		'replace': true,
		'points':{}
	};

	const grouped = await SQL.query(dateQuery);
	if (grouped.length === 0) {
		return {
			'command':'data',
			'data':'temps',
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
		query = `SELECT * FROM \`temperature\` WHERE \`system\` = '${header.system}' ORDER BY \`PK\` ASC LIMIT 1; `;
	} else {
		query = `SELECT * FROM \`temperature\` WHERE time IN (${whereString}) AND \`system\` = '${header.system}' ORDER BY \`PK\` ASC; `;
	}

	const rows = await SQL.query(query);

	const dataObj = {
		'command':'data',
		'data':'temps',
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
		point[row.frame] = row.temperature;

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
			log('Connected client has different major version, it will not work with this server!', 'E');
		} else {
			log('Connected client has differnet version, support not guaranteed', 'W');
		}
	}
	log(`${logs.g}${header.fromID}${logs.reset} Registered as new client`, 'D');
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
	header.system = config.get('systemName');
	return header;
}

function distributeData(type, data) {
	sendCloudData({'command':'log', 'type':type, 'data':data});
	webServer.sendToAll({'command':'log', 'type':type, 'data':data});
}


/* Switch poll functions */


function lldpLoop() {
	if (config.get('devMode')) return;
	let Switches = switches('Media');
	log('Getting LLDP neighbors', 'A');
	let promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		let Switch = Switches[i];
		promisses.push(doApi(lldpRequest, Switch));
	}
	return Promise.all(promisses).then((values) => {
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let neighbors = values[i].result[1].lldpNeighbors;
				data.neighbors[Switches[i].Name] = {};
				let thisSwitch = data.neighbors[Switches[i].Name];
				for (let j in neighbors) {
					let t = neighbors[j];
					if (!t.port.includes('Ma')) {
						thisSwitch[t.port] = { lldp: t.neighborDevice };
					}
				}
			} else {
				log(`(LLDP) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
			}
		}

		distributeData('lldp', data.neighbors);
	});
}

function switchMac() {
	if (config.get('devMode')) return;
	let Switches = switches('Media');
	log('Checking for recent interface dropouts', 'A');
	function processSwitchMac(response, devices) {
		let keys = Object.keys(devices);
		let split = response.result[1].output.split('\n');
		for (let i = 8; i < split.length; i++) {
			let t = split[i];
			let mac = {
				int: t.substr(0, 19).trim(),
				config: t.substr(19, 7).trim(),
				oper: t.substr(26, 9).trim(),
				phy: t.substr(34, 16).trim(),
				mac: t.substr(50, 6).trim(),
				last: t.substr(54, t.length).trim()
			};

			if (mac.config == 'Up') {
				if (!keys.includes(mac.int)) {
					devices[mac.int] = {};
				}
				devices[mac.int].mac = {};
				devices[mac.int].mac.operState = mac.oper;
				devices[mac.int].mac.phyState = mac.phy;
				devices[mac.int].mac.macFault = mac.mac;
				devices[mac.int].mac.lastChange = mac.last;
				devices[mac.int].description = getDescription(devices[mac.int].lldp);
				devices[mac.int].port = mac.int;
			}
		}
		return devices;
	}

	let promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi(macRequest, Switches[i]));
	}
	return Promise.all(promisses).then((values) => {
		let filteredDevices = [];
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let procDev = clearEmpties(processSwitchMac(values[i], data.neighbors[Switches[i].Name]));

				for (let dev in procDev) {
					if (typeof procDev[dev].mac !== 'undefined') {
						if(!('lastChange' in procDev[dev].mac)) {
							log(procDev[dev]+' seems to have an issue','W');
						}
						let time = procDev[dev].mac.lastChange.split(':');
						let timeTotal = parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2]);
						if (timeTotal < 300) {
							procDev[dev].switch = Switches[i].Name;
							filteredDevices.push(procDev[dev]);
						}
					}
				}

			} else {
				log(`(MAC) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
			}
		}
		data.mac = filteredDevices;
		distributeData('mac', data.mac);
	});
}

function switchPhy() {
	if (config.get('devMode')) return;
	const Switches = switches('Media');
	log('Looking for high numbers of PHY/FEC errors', 'A');
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
					devices[portName].description = getDescription(devices[portName].lldp);
				}
			} else if (fec?.encoding == 'fireCode') {
				if (fec.perLaneUncorrectedFecBlocks[0].value > 100) {
					devices[portName].phy = {};
					devices[portName].phy.current = fec.perLaneUncorrectedFecBlocks[0].value;
					devices[portName].phy.changes = fec.perLaneUncorrectedFecBlocks[0].changes;
					devices[portName].phy.lastChange = fec.perLaneUncorrectedFecBlocks[0].lastChange;
					devices[portName].port = portName;
					devices[portName].description = getDescription(devices[portName].lldp);
				}
			}
		}
		return devices;
	}

	let promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi(phyRequest, Switches[i]));
	}
	return Promise.all(promisses).then((values) => {
		let filteredDevices = [];
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let procDev = processSwitchPhy(values[i], data.neighbors[Switches[i].Name]);

				for (let dev in procDev) {
					if ('phy' in procDev[dev]) {
						procDev[dev].switch = Switches[i].Name;
						filteredDevices.push(procDev[dev]);
						//}
					}
				}
			} else {
				log(`(PHY) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
			}
		}
		data.phy = filteredDevices;
		distributeData('phy', data.phy);
	});
}

function switchFibre() {
	if (config.get('devMode')) return;
	let Switches = switches('Media');
	log('Looking for low fibre levels in trancievers', 'A');
	function processSwitchFibre(response, devices) {
		let keys = Object.keys(devices);
		let ints = response.result[0].interfaces;
		for (let i in ints) {
			let int = ints[i];
			if ('rxPower' in int) {
				if (!keys.includes(i)) {
					devices[i] = {};
				}
				devices[i].port = i;
				devices[i].description = getDescription(devices[i].lldp);
				devices[i].rxPower = int.rxPower.toFixed(1);
				if ('txPower' in int)
					devices[i].txPower = int.txPower.toFixed(1);
			}
		}
		return devices;
	}

	let promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi(fibreRequest, Switches[i]));
	}
	return Promise.all(promisses).then((values) => {
		let filteredDevices = [];
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let procDev = processSwitchFibre(values[i], data.neighbors[Switches[i].Name]);

				for (let dev in procDev) {
					if ('txPower' in procDev[dev] && 'rxPower' in procDev[dev]) {
						if (procDev[dev].rxPower < -9 && procDev[dev].rxPower > -30 && procDev[dev].txPower > -30) {
							procDev[dev].switch = Switches[i].Name;
							filteredDevices.push(procDev[dev]);
						}
					}
				}
			} else {
				log(`(TRANS) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
			}
		}
		data.fibre = filteredDevices;
		distributeData('fibre', data.fibre);
	});
}

function checkUps() {
	if (config.get('devMode')) return;
	let Ups = ups();
	log('Getting UPS status', 'A');
	function getUpsStatus(ip) {
		return fetch('http://' + ip + '/json/live_data.json?_=' + Math.floor(Math.random() * 10000000), {
			method: 'GET'
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
					};
				});
			}
		});
	}

	let promises = [];
	for (let index = 0; index < Ups.length; index++) {
		promises.push(getUpsStatus(Ups[index].IP));
	}

	return Promise.allSettled(promises).then((values) => {
		let filteredUps = [];

		for (let i = 0; i < Ups.length; i++) {
			if (values[i].status === 'rejected' || typeof values[i].value == 'undefined') {
				Ups[i].Status = 'Offline';
				if (!Ups[i].linePresent || !Ups[i].outputPowered || Ups[i].load > 80) {
					filteredUps.push(Ups[i]);
				}
			} else {
				values[i].value.name = Ups[i].Name;
				delete values[i].value.ip;
				Ups[i] = values[i].value;
				Ups[i].Status = 'Online';
			}
		}
		data.ups = filteredUps;
		distributeData('ups', data.ups);
	});
}

function checkDevices() {
	if (config.get('devMode')) return;
	log('Checking device lists for missing devices', 'A');
	let Devices = devices();
	let missingDevices = {};
	let expectedDevices = [];
	for (let i in Devices) {
		expectedDevices = [...new Set([...expectedDevices, ...parseTempalteString(Devices[i].name)])];
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
			const missingSwitchDevices = expectedDevices.filter(x => !lldpNeighbors.includes(x));
			for (let index = 0; index < missingSwitchDevices.length; index++) {
				const device = missingSwitchDevices[index];
				if (typeof missingDevices[device] === 'undefined') {
					missingDevices[device] = [];
				}
				missingDevices[device].push(Switch);
			}
		}
	}
	data.devices = missingDevices;
	distributeData('devices', data.devices);
}

function doApi(json, Switch) {
	const ip = Switch.IP;
	const user = Switch.User;
	const pass = Switch.Pass;
	log(`Polling switch API endpoint http://${ip}/command-api for data`, 'D');
	return fetch(`http://${ip}/command-api`, {
		method: 'POST',
		headers: {
			'content-type': 'expressApplication/json',
			'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
		},
		body: JSON.stringify(json),
	}).then((response) => {
		if (response.status === 200) {
			return response.json().then((jsonRpcResponse) => { return jsonRpcResponse; });
		}
	}).catch((error)=>{
		log(`Failed to connect to switch ${ip}`, 'E');
		logObj(error, 'D');
	});
}

function doApi2(request, Switch) {
	const ip = Switch.IP;
	const user = Switch.User;
	const pass = Switch.Pass;
	const OS = Switch.OS;
	let endPoint = '';
	let protocol = 'http';

	switch (OS) {
		case 'EOS':
			endPoint = 'command-api'
			protocol = 'http';
		case 'NX-OS':
			endPoint = 'ins'
			protocol = 'https';
		default:
			break;
	}
	log(`Polling switch API endpoint ${protocol}://${ip}/${endPoint} for data`, 'D');
	return fetch(`${protocol}://${ip}/${endPoint}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json-rpc',
			'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
		},
		body: JSON.stringify(SwitchRequests[OS][request]),
		agent: httpsAgent,
	}).then((response) => {
		if (response.status === 200) {
			return response.json().then((jsonRpcResponse) => { return jsonRpcResponse; });
		}
	}).catch((error)=>{
		log(`Failed to connect to switch ${ip}`, 'E');
		logObj(error, 'D');
	});
}


/* Control Functions */

function localPings() {
	const hosts = pings();
	hosts.forEach(function (host) {
		ping.promise.probe(host.IP, {
			timeout: 10
		}).then(function(res) {
			log(`IP: ${host.IP}, Online: ${res.alive}`, 'A');
			distributeData('localPing', {'status':res.alive, 'IP':host.IP, 'Name':host.Name});
		});
	});
}

function controlLoop() {
	//if (config.get('devMode')) return;
	let Switches = switches('Control');
	log('Getting Control neighbors', 'A');
	let promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		let Switch = Switches[i];
		promisses.push(doApi2('neighborRequest', Switch));
	}
	return Promise.all(promisses).then((values) => {
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				switch (Switches[i].OS) {
					case 'NX-OS': {
						let neighbors = values[i].result.body.TABLE_cdp_neighbor_brief_info.ROW_cdp_neighbor_brief_info;
						data.controlNeighbors[Switches[i].Name] = [];
						let thisSwitch = data.controlNeighbors[Switches[i].Name];
						for (let j in neighbors) {
							const neighbor = neighbors[j];
							if (!neighbor.intf_id?.includes('mgmt')) {
								thisSwitch.push({
									'interface': neighbor.intf_id,
									'lldp': neighbor.device_id,
									'model': neighbor.platform_id,
									'port': neighbor.port_id
								});
							}
						}
						break;
					}
					case 'EOS': {
						let neighbors = values[i].result[1].lldpNeighbors;
						data.neighbors[Switches[i].Name] = {};
						let thisSwitch = data.neighbors[Switches[i].Name];
						for (let j in neighbors) {
							let t = neighbors[j];
							if (!t.port.includes('Ma')) {
								thisSwitch[t.port] = { lldp: t.neighborDevice };
							}
						}
						break;
					}
					default:
						break;
				}
			} else {
				log(`(LLDP/CDP) Return data from control switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
			}
		}
		/*for (const port in data.controlNeighbors) {
			const neighbor = data.controlNeighbors[port];

		}*/
		distributeData('controlNeighbors', data.controlNeighbors);
	}).catch(error => {
		logs.error('Error collecting switch data', error);
	});
}


/* Web Logging Functions */


async function logTemp() {
	if (config.get('devMode')) return;
	let Frames = frames();
	log('Getting temperatures', 'A');

	let promises = [];

	for (let index = 0; index < Frames.length; index++) {
		const frame = Frames[index];
		const response = await fetch('http://'+frame.IP);
		promises.push(response.text());
	}

	const results = await Promise.allSettled(promises);
	log('Got temperature data, processing', 'D');
	let tempSum = 0;
	let tempValid = 0;
	const socketSend = {};

	for (let index = 0; index < Frames.length; index++) {
		const frameData = results[index];

		if (frameData.status == 'fulfilled') {
			try {				
				let temp = 0;
				const frameStatData = frameData.value.split('<p><b>Temperature In:</b></p>');
				if (typeof frameStatData[1] == 'undefined') return;
				const frameStat = frameStatData[1].slice(25,27);
				if (frameStat == 'OK') {
					let unfilteredTemp = frameData.value.split('<p><b>Temperature In:</b></p>')[1].slice(29,33);
					temp = parseInt(unfilteredTemp.substring(0, unfilteredTemp.indexOf(')')));
				} else {
					log(`${Frames[index].Name} frame temperature is not OK`, 'W');
				}
				Frames[index].Temp = temp;
				tempSum += temp;
				tempValid++;
				log(`${Frames[index].Name} temperature = ${temp} deg C`, 'D');
				if (config.get('localDataBase')) SQL.insert({
					'frame': Frames[index].Name,
					'temperature': Frames[index].Temp,
					'system': config.get('systemName')
				}, 'temperature');
				socketSend[Frames[index].Name] = Frames[index].Temp;
			} catch (error) {
				logObj(`Error processing data for from: '${Frames[index].Name}'`, error, 'W');
			}
		} else {
			log(`Can't connect to frame: '${Frames[index].Name}'`, 'W');
		}
	}

	let tempAvg;

	if (tempValid == 0) {
		log('Invalid temperature measured connections must have failed', 'E');
		sendSms('CANNOT CONNECT TO MCR, MAYBE IT HAS MELTED?');
	} else {
		tempAvg = tempSum / tempValid;
		log(`Average temperature = ${tempAvg} deg C`, 'D');
		log(`Warning temperature = ${config.get('warningTemperature')} deg C`, 'D');

		if (tempAvg > config.get('warningTemperature')) {
			log('Warning: Temperature over warning limit, sending SMS', 'W');
			sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`);
		}
		sendCloudData({'command':'log', 'type':'temperature', 'data':Frames});

		socketSend.average = tempAvg;
		const time = new Date().getTime();
		const points = {};
		points[time] = socketSend;
		webServer.sendToAll({
			'command': 'data',
			'data': 'temps',
			'system': config.get('systemName'),
			'replace': false,
			'points': points
		});

	}

}

function webLogPing() {
	if (!config.get('webEnabled')) return;
	log('Pinging webserver', 'A');
	sendCloudData({'command':'log', 'type':'ping'});
}

function webLogBoot() {
	if (!config.get('webEnabled')) return;
	log('Sending boot');
	sendCloudData({'command':'log', 'type':'boot'});
}

function sendSms(msg) {
	if (!config.get('textsEnabled')) return;

	let params = {
		Message: msg,
		TopicArn: 'arn:aws:sns:eu-west-2:796884558775:TDS_temperature'
	};

	let promise = new AWS.SNS({ apiVersion: '2010-03-31' }).publish(params).promise();
	promise.then(function (data) {
		log(`Text message sent - messageId: ${data.MessageId}`);
	}).catch(function (err) {
		logs.error(err, err.stack);
	});
}

async function connectToWebServer(retry = false) {	
	if(!config.get('webEnabled')) return;
	let inError = false;
	let promise;

	if (cloudServer.address !== config.get('webSocketEndpoint')) {
		cloudServer.address = config.get('webSocketEndpoint');
		cloudServer.conneceted = false;
		if (typeof cloudServer.socket !== 'undefined') cloudServer.socket.close();
		delete cloudServer.socket;
	}

	if ((!cloudServer.connected && cloudServer.active && cloudServer.attempts < 3) || (retry && !cloudServer.connected)) {
		const protocol = config.get('secureWebSocketEndpoint') ? 'wss' : 'ws';
		if (retry) {
			log(`Retrying connection to dead server: ${logs.r}${protocol}://${cloudServer.address}${logs.reset}`, 'W');
		}
		cloudServer.socket = new WebSocket(`${protocol}://${cloudServer.address}`);

		promise = new Promise(resolve=>{
			cloudServer.socket.on('open', function open() {
				let payload = {};
				payload.command = 'register';
				payload.name = config.get('systemName');
				sendCloudData(payload);
				resolve();
				log(`${logs.g}${cloudServer.address}${logs.reset} Established a connection to webserver`, 'S');
				cloudServer.connected = true;
				cloudServer.active = true;
				cloudServer.attempts = 0;
			});
		});

		cloudServer.socket.on('message', function message(msgJSON) {
			try {
				const msgObj = JSON.parse(msgJSON);
				if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
					logObj('Received from other server', msgObj, 'A');
				} else if (config.get('printPings') == true) {
					logObj('Received from other server', msgObj, 'A');
				}
				switch (msgObj.payload.command) {
				case 'ping':
					sendCloudData({
						'command': 'pong'
					});
					break;
				case 'data':
					log('Recieved temp/ping data from server', 'D');
					break;
				default:
					logObj('Received unknown from other server', msgObj, 'W');
				}
			} catch (e) {
				try {
					const msgObj = JSON.parse(msgJSON);
					if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
						logObj('Received from other server', msgObj, 'A');
					} else if (config.get('printPings') == true) {
						logObj('Received from other server', msgObj, 'A');
					}
					if (typeof msgObj.type == 'undefined') {
						let stack = e.stack.toString().split(/\r\n|\n/);
						stack = JSON.stringify(stack, null, 4);
						log(`Server error, stack trace: ${stack}`, 'E');
					} else {
						log('A device is using old \'chiltv\' data format, upgrade it to v4.0 or above', 'E');
					}
				} catch (e2) {
					log('Invalid JSON from other server- '+e, 'E');
					logObj('Received from other server', JSON.parse(msgJSON), 'A');
				}
			}
		});

		cloudServer.socket.on('close', function close() {
			cloudServer.connected = false;
			delete cloudServer.socket;
			cloudServer.attempts++;
			if (!inError) {
				log(`${logs.r}${cloudServer.address}${logs.reset} Outbound webserver connection closed`, 'W');
			}
		});

		cloudServer.socket.on('error', function error() {
			inError = true;
			log(`Could not connect to server: ${logs.r}${cloudServer.address}${logs.reset}`, 'E');
		});
		
	} else if (!cloudServer.connected && cloudServer.active) {
		cloudServer.active = false;
		log(`Server not responding, changing status to dead: ${logs.r}${cloudServer.address}${logs.reset}`, 'E');
	}
	return promise;
}

function sendCloudData(payload) {
	if (!config.get('webEnabled')) return;
	let packet = {};
	packet.header = makeHeader();
	packet.payload = payload;
	if (cloudServer.connected) {
		cloudServer.socket.send(JSON.stringify(packet));
	}
}


/* Config Functions */


async function configQuestion(question, current, options) {
	mainWindow.webContents.send('configQuestion', JSON.stringify({
		'question': question,
		'current': current,
		'options': options
	}));
	const awaitMessage = new Promise (resolve => {
		ipcMain.once('configMessage', (event, value) => {
			if (value == 'true') value = true;
			if (value == 'false') value = false;
			const newVal = parseInt(value);
			if (!isNaN(newVal)) value = newVal;
			resolve(value);
		});
	});
	return awaitMessage;
}

async function configDone() {
	mainWindow.webContents.send('configDone', true);
	logs.setConf({
		'createLogFile': config.get('createLogFile'),
		'logsFileName': 'ArgosLogging',
		'configLocation': path.join(app.getPath('documents'), 'ArgosData'),
		'loggingLevel': config.get('loggingLevel'),
		'debugLineNum': config.get('debugLineNum'),
	});
	if (configLoaded) mainWindow.webContents.send('loaded', `http://localhost:${config.get('port')}`);
	if (config.get('localDataBase')) {
		SQL = new SQLSession(
			config.get('dbHost'),
			config.get('dbPort'),
			config.get('dbUser'),
			config.get('dbPass'),
			config.get('dbName'),
			logs
		);
		await SQL.init(tables);
	}
}

/* Utility Functions */


function parseTempalteString(string) {

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

function getDescription(deviceName) {
	if (typeof deviceName !== 'undefined') {
		const map = devices().reduce((obj, item) => Object.assign(obj, { [item.name]: item.description }), {});
		let trimmedDeviceName = deviceName.slice(0, deviceName.lastIndexOf('_') + 1);
		return map[trimmedDeviceName];
	} else {
		return undefined;
	}
}

function minutes(mins) {
	return parseInt(mins) * 60;
}

function clearEmpties(o) {
	for (let k in o) {
		if (!o[k] || typeof o[k] !== 'object') {
			continue; // If null or not an object, skip to the next iteration
		}

		// The property is an object
		clearEmpties(o[k]); // <-- Make a recursive call on the nested object
		if (Object.keys(o[k]).length === 0) {
			delete o[k]; // The object had no properties, so delete that property
		}
	}
	return o;
}

async function startLoopAfterDelay(callback, seconds) {
	setInterval(callback, seconds * 1000);
	callback();
	log('Starting '+callback.name, 'A');
	await sleep(1);
}

async function sleep(seconds) {
	await new Promise (resolve => setTimeout(resolve, 1000*seconds));
}