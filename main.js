/* eslint-disable no-unused-vars */
const serverID = new Date().getTime();

const {WebSocket} = require('ws');
const express = require('express');
const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const {Logs} = require('xeue-logs');
const {Config} = require('xeue-config');
const {SQLSession} = require('xeue-sql');
const {Server} = require('xeue-webserver');
const {SysLogServer} = require('./syslog.js');
const {app, BrowserWindow, ipcMain, Tray, Menu} = require('electron');
const {version} = require('./package.json');
const electronEjs = require('electron-ejs');
const AutoLaunch = require('auto-launch');
const ping = require('ping');
const https = require('https');
const {MicaBrowserWindow, IS_WINDOWS_11} = require('mica-electron');
//const snmp = require ('net-snmp');

const background = IS_WINDOWS_11 ? 'micaActive' : 'bg-dark';

const httpsAgent = new https.Agent({
	rejectUnauthorized: false,
});

const __static = __dirname+'/static';

const ejs = new electronEjs({'static': __static, 'background': background}, {});

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
	'phy': {}
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
		'neighborRequest': {
			"jsonrpc": "2.0",
			"method": "cli",
			"params": {
				"cmd": "show cdp neighbors",
				"version": 1
			},
			"id": 1
		},
		'transRequest': {
			"jsonrpc": "2.0",
			"method": "cli",
			"params": {
				"cmd": "show interface transceiver details",
				"version": 1
			},
			"id": 1
		},
		'flapRequest': {
			"jsonrpc": "2.0",
			"method": "cli",
			"params": {
				"cmd": "show interface mac",
				"version": 1
			},
			"id": 1
		},
		'power': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'show system environment power'
				],
				'version': 1
			},
			'id': ''
		},
		'fans': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'show system environment cooling'
				],
				'version': 1
			},
			'id': ''
		},
		'temperature': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'show system environment temperature'
				],
				'version': 1
			},
			'id': ''
		},
		'interfaces': {
			"jsonrpc": "2.0",
			"method": "cli",
			"params": {
				"cmd": "show interface",
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
		'flapRequest': {
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
		},
		'power': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					'show system environment power'
				],
				'version': 1
			},
			'id': ''
		},
		'fans': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					'show system environment cooling'
				],
				'version': 1
			},
			'id': ''
		},
		'temperature': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					'show system environment temperature'
				],
				'version': 1
			},
			'id': ''
		},
		'interfaces': {
			'jsonrpc': '2.0',
			'method': 'runCmds',
			'params': {
				'format': 'json',
				'timestamps': false,
				'autoComplete': false,
				'expandAliases': false,
				'cmds': [
					'enable',
					'show interfaces'
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
const tempFrequency = minutes(1);
//const tempFrequency = 5;
const localPingFrequency = 10;
const envFrequency = 30;
const interfaceFrequency = 30;

/* Globals */

let isQuiting = false;
let mainWindow = null;
let SQL;
let configLoaded = false;
let cachedUpsTemps = {};
const devEnv = app.isPackaged ? './' : './';
const __main = path.resolve(__dirname, devEnv);

const logger = new Logs(
	false,
	'ArgosLogging',
	path.join(app.getPath('documents'), 'ArgosData'),
	'D',
	false
)
const config = new Config(
	logger
);
const webServer = new Server(
	expressRoutes,
	logger,
	version,
	config,
	doMessage
);
const syslogServer = new SysLogServer(
	logger,
	doSysLogMessage
);

/* Start App */

(async () => {

	await app.whenReady();
	await setUpApp();
	await createWindow();

	{ /* Config */
		logger.printHeader('Argos Monitoring');
		config.require('port', [], 'What port shall the server use');
		config.require('syslogPort', [], 'What port shall the server listen to syslog messages on');
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
		config.default('syslogPort', 514);
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

		logger.setConf({
			'createLogFile': config.get('createLogFile'),
			'logsFileName': 'ArgosLogging',
			'configLocation': path.join(app.getPath('documents'), 'ArgosData'),
			'loggingLevel': config.get('loggingLevel'),
			'debugLineNum': config.get('debugLineNum'),
		});

		logger.log('Running version: v'+version, ['H', 'SERVER', logger.g]);
		logger.log(`Logging to: ${path.join(app.getPath('documents'), 'ArgosData', 'logs')}`, ['H', 'SERVER', logger.g]);
		logger.log(`Config saved to: ${path.join(app.getPath('documents'), 'ArgosData', 'config.conf')}`, ['H', 'SERVER', logger.g]);
		config.print();
		config.userInput(async command => {
			switch (command) {
			case 'config':
				await config.fromCLI(path.join(app.getPath('documents'), 'ArgosData', 'config.conf'));
				if (config.get('loggingLevel') == 'D' || config.get('loggingLevel') == 'A') {
					config.set('debugLineNum', true);
				}
				logger.setConf({
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

	if (config.get('localDataBase')) {
		SQL = new SQLSession(
			config.get('dbHost'),
			config.get('dbPort'),
			config.get('dbUser'),
			config.get('dbPass'),
			config.get('dbName'),
			logger
		);
		await SQL.init(tables);
		const sensor = await SQL.query("SHOW COLUMNS FROM `temperature` LIKE 'test';");
		if (sensor.length == 0) {
			await SQL.query("ALTER TABLE `temperature` RENAME COLUMN frame TO sensor;");
		}
		const sensorType = await SQL.query("SHOW COLUMNS FROM `temperature` LIKE 'sensorType';");
		if (sensorType.length == 0) {
			await SQL.query("ALTER TABLE `temperature` ADD COLUMN sensorType text NOT NULL;");
			await SQL.query("UPDATE `temperature` SET sensorType = 'IQ Frame' WHERE 1=1;");
		}
	}

	webServer.start(config.get('port'));
	syslogServer.start(config.get('syslogPort'));

	logger.log(`Argos can be accessed at http://localhost:${config.get('port')}`, 'C');
	mainWindow.webContents.send('loaded', `http://localhost:${config.get('port')}/inApp`);

	connectToWebServer(true).then(()=>{
		webLogBoot();
	});

	// 1 Minute ping loop
	setInterval(() => {
		connectToWebServer(true);
	}, 60*1000);
	
	await startLoopAfterDelay(logTemp, tempFrequency);
	await startLoopAfterDelay(switchInterfaces, interfaceFrequency, 'Media');
	await startLoopAfterDelay(switchInterfaces, interfaceFrequency, 'Control');
	await startLoopAfterDelay(localPings, localPingFrequency);
	await startLoopAfterDelay(connectToWebServer, 5);
	await startLoopAfterDelay(webLogPing, pingFrequency);
	await startLoopAfterDelay(switchEnv, envFrequency, 'Media');
	await startLoopAfterDelay(lldpLoop, lldpFrequency, 'Media');
	await startLoopAfterDelay(checkDevices, devicesFrequency, 'Media', true);
	await startLoopAfterDelay(switchFlap, switchStatsFrequency, 'Media');
	//await startLoopAfterDelay(switchPhy, switchStatsFrequency, 'Media');
	await startLoopAfterDelay(switchFibre, switchStatsFrequency, 'Media');
	await startLoopAfterDelay(switchEnv, envFrequency, 'Control');
	await startLoopAfterDelay(lldpLoop, lldpFrequency, 'Control');
	await startLoopAfterDelay(checkDevices, devicesFrequency, 'Control', false);
	await startLoopAfterDelay(switchFibre, switchStatsFrequency, 'Control');
	await startLoopAfterDelay(checkUps, upsFrequency);
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
			logger.log('Not implemeneted yet: Cancle config change');
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

	logger.on('logSend', message => {
		if (!isQuiting) mainWindow.webContents.send('log', message);
	});
}

async function createWindow() {
	const windowOptions = {
		width: 1440,
		height: 720,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			preload: path.resolve(__main, 'preload.js')
		},
		icon: path.join(__static, 'img/icon/icon.png'),
		show: false,
		sensor: false,
		titleBarStyle: 'hidden',
		titleBarOverlay: {
			color: '#313d48',
			symbolColor: '#ffffff',
			height: 56
		}
	}
	
	if (IS_WINDOWS_11) {
		mainWindow = new MicaBrowserWindow(windowOptions);
		mainWindow.setDarkTheme();
		mainWindow.setMicaEffect();
	} else {
		mainWindow = new BrowserWindow(windowOptions);
	}

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
				mainWindow.webContents.send('loaded', `http://localhost:${config.get('port')}/inApp`);
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
			logger.object(`There is an error with the syntax of the JSON in ${file}.json file`, error, 'E');
			return [];
		}
	} catch (error) {
		logger.log(`Cloud not read the file ${file}.json, attempting to create new file`, 'W');
		logger.debug('File error:', error);
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
		logger.object(`Cloud not write the file ${file}.json, do we have permission to access the file?`, error, 'E');
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
function ports(type) {
	const Ports = loadData('Ports');
	const Switches = switches(type).map(arr => arr.Name);
	if (type !== undefined) return Ports.filter(port => Switches.includes(port.Switch));
	return Ports;
}


/* Express setup & Websocket Server */


function expressRoutes(expressApp) {
	expressApp.set('views', path.join(__main, 'views'));
	expressApp.set('view engine', 'ejs');
	expressApp.use(express.json());
	expressApp.use(express.static(__static));

	expressApp.get('/',  (req, res) =>  {
		logger.log('New client connected', 'A');
		res.header('Content-type', 'text/html');
		res.render('web', {
			switches:switches('Media'),
			controlSwitches:switches('Control'),
			systemName:config.get('systemName'),
			webSocketEndpoint:config.get('webSocketEndpoint'),
			secureWebSocketEndpoint:config.get('secureWebSocketEndpoint'),
			webEnabled:config.get('webEnabled'),
			version: version,
			pings:syslogSourceList(),
			background:'bg-dark'
		});
	});

	expressApp.get('/inApp',  (req, res) =>  {
		logger.log('New client connected', 'A');
		res.header('Content-type', 'text/html');
		res.render('web', {
			switches:switches('Media'),
			controlSwitches:switches('Control'),
			systemName:config.get('systemName'),
			webSocketEndpoint:config.get('webSocketEndpoint'),
			secureWebSocketEndpoint:config.get('secureWebSocketEndpoint'),
			webEnabled:config.get('webEnabled'),
			version: version,
			pings:syslogSourceList(),
			background:'micaActive'
		});
	});

	expressApp.get('/about', (req, res) => {
		logger.log('Collecting about information', 'A');
		res.header('Content-type', 'text/html');
		const aboutInfo = {
			'aboutInfo': {
				'Version': version,
				'Config': config.all(),
				'Switches':switches(),
				'Temp Sensors':temps(),
				'UPS':ups(),
				'Devices':devices(),
				'Pings':pings(),
				'Port Monitoring':ports()
			},
			'systemName': config.get('systemName')
		}
		res.render('about', aboutInfo);
	})

	expressApp.get('/broken', (req, res) => {
		res.send('no');
	});

	expressApp.get('/fibre', (req, res) => {
		logger.log('Request for fibre data', 'D');
		res.send(JSON.stringify(data.fibre));
	});

	expressApp.get('/ups', (req, res) => {
		logger.log('Request for UPS data', 'D');
		res.send(JSON.stringify(data.ups));
	});

	expressApp.get('/phy', (req, res) => {
		logger.log('Request for PHY/FEC data', 'D');
		res.send(JSON.stringify(data.phy));
	});

	expressApp.get('/mac', (req, res) => {
		logger.log('Request for mac/flap data', 'D');
		res.send(JSON.stringify(data.mac));
	});

	expressApp.get('/devices', (req, res) => {
		logger.log('Request for devices data', 'D');
		res.send(JSON.stringify(data.devices.Media));
	});

	expressApp.get('/getConfig', (req, res) => {
		logger.log('Request for devices config', 'D');
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
		logger.log('Requesting app config', 'A');
		res.send(JSON.stringify(config.all()));
	});

	expressApp.post('/setswitches', (req, res) => {
		logger.log('Request to set switches config data', 'D');
		writeData('Switches', req.body);
		res.send('Done');
	});
	expressApp.post('/setports', (req, res) => {
		logger.log('Request to set ports config data', 'D');
		writeData('Ports', req.body);
		res.send('Done');
	});
	expressApp.post('/setdevices', (req, res) => {
		logger.log('Request to set devices config data', 'D');
		writeData('Devices', req.body);
		res.send('Done');
	});
	expressApp.post('/setups', (req, res) => {
		logger.log('Request to set ups config data', 'D');
		writeData('Ups', req.body);
		res.send('Done');
	});
	expressApp.post('/settemps', (req, res) => {
		logger.log('Request to set temps config data', 'D');
		writeData('Temps', req.body);
		res.send('Done');
	});
	expressApp.post('/setpings', (req, res) => {
		logger.log('Request to set pings config data', 'D');
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
		logger.object('Received', msgObj, 'D');
		socket.send('Received meta');
		break;
	case 'register':
		coreDoRegister(socket, msgObj);
		break;
	case 'get':
		switch (payload.data) {
			case 'temperature':
				getTemperature(header, payload, 'IQ Frame').then(data => {
					webServer.sendTo(socket, data);
				});
				break;
			case 'temperatureGeneric':
				getTemperature(header, payload, 'Will N Sensor').then(data => {
					webServer.sendTo(socket, data);
				});
				break;
			case 'syslog':
				getSyslog(header, payload).then(data => {
					webServer.sendTo(socket, data);
				})
			default:
				break;
		}
		break;
	default:
		logger.object('Unknown message', msgObj, 'W');
	}
}

async function doSysLogMessage(msg, info) {
	const message = msg.toString().replace(/\'/g, '"');
	if (config.get('localDataBase')) SQL.insert({
		'message': message,
		'ip': info.address,
		'system': config.get('systemName')
	}, 'syslog');
	webServer.sendToAll({
		'command': 'data',
		'data': 'syslog',
		'system': config.get('systemName'),
		'replace': false,
		'logs': [{
			'message': message,
			'ip': info.address,
			'system': config.get('systemName'),
			'time': new Date()
		}]
	})

}

async function getTemperature(header, payload, type) {
	logger.log(`Getting temps for ${header.system}`, 'D');
	const from = payload.from;
	const to = payload.to;
	const dateQuery = `SELECT ROW_NUMBER() OVER (ORDER BY PK) AS Number, \`PK\`, \`time\` FROM \`temperature\` WHERE time BETWEEN FROM_UNIXTIME(${from}) AND FROM_UNIXTIME(${to}) AND \`system\` = '${header.system}' AND \`sensorType\` = '${type}' GROUP BY \`time\`; `;

	if (!config.get('localDataBase')) return {
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
	logger.log(`Getting syslogs for ${header.system}, ips: ${payload.ips.join(',')}`, 'D');
	const from = payload.from;
	const to = payload.to;
	let whereIP = '';
	if (payload.ips.length > 0 && !payload.ips.includes('all')) {
		const ips = payload.ips.map(ip => `'${ip}'`);
		whereIP = `AND \`ip\` IN (${ips.join(',')})`
	}
	const dateQuery = `SELECT * FROM \`syslog\` WHERE time BETWEEN FROM_UNIXTIME(${from}) AND FROM_UNIXTIME(${to}) AND \`system\` = '${header.system}' ${whereIP}; `;

	if (!config.get('localDataBase')) return {
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

	return dataObj = {
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
			logger.log('Connected client has different major version, it will not work with this server!', 'E');
		} else {
			logger.log('Connected client has differnet version, support not guaranteed', 'W');
		}
	}
	logger.log(`${logger.g}${header.fromID}${logger.reset} Registered as new client`, 'D');
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


async function lldpLoop(switchType) {
	const Switches = switches(switchType);
	logger.log(`Getting LLDP neighbors for ${switchType} switches`, 'A');
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('neighborRequest', Switches[i]));
	}
	const values = await Promise.all(promisses);
	for (let i = 0; i < values.length; i++) {
		if (values[i] === undefined) {
			logger.log(`(LLDP) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
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
	logger.log('Checking for recent interface dropouts', 'A');
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('flapRequest', Switches[i]));
	}
	const values = await Promise.all(promisses);
	const filteredDevices = [];
	for (let i = 0; i < values.length; i++) {
		if (values[i] === undefined) {
			logger.log(`(FLAP) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
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
	const type = switchType == 'Media' ? 'flap' : 'flap_control';
	distributeData(type, data.mac[switchType]);
}

function switchPhy(switchType) {
	if (config.get('devMode')) return;
	const Switches = switches('Media');
	logger.log('Looking for high numbers of PHY/FEC errors', 'A');
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
				logger.log(`(PHY) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
			}
		}
		data.phy = filteredDevices;
		distributeData('phy', data.phy);
	});
}

async function switchFibre(switchType) {
	const Switches = switches(switchType);
	logger.log('Looking for low fibre levels in trancievers', 'A');
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('transRequest', Switches[i]));
	}
	const values = await Promise.all(promisses);
	const filteredDevices = [];
	for (let i = 0; i < values.length; i++) {
		if (values[i] === undefined) {
			logger.log(`(TRANS) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
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
	logger.log('Checking switch environment paramaters', 'A');
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
			logger.log(`(ENV) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
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

async function switchInterfaces(switchType) {
	const Switches = switches(switchType);
	logger.log('Checking switch interfaces', 'A');
	const promisses = [];
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi('interfaces', Switches[i]));
	}
	const values = await Promise.all(promisses);
	const filteredPorts = {};
	for (let i = 0; i < Switches.length; i++) {
		if (values[i] === undefined) {
			logger.log(`(INT) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W');
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
	ports(switchType).forEach(port => {
		try {
			if (filteredPorts[switchType] === undefined) filteredPorts[switchType] = {};
			if (filteredPorts[switchType][port.Switch] === undefined) filteredPorts[switchType][port.Switch] = {};
			if (Object.keys(data.interfaces[switchType][port.Switch]).includes(port.Port)) {
				filteredPorts[switchType][port.Switch][port.Port] = data.interfaces[switchType][port.Switch][port.Port];
			}
		} catch (error) {
			logger.warn("Couldn't parse interfaces data");
		}

	})
	const type = switchType == 'Media' ? 'interfaces' : 'interfaces_control';
	distributeData(type, filteredPorts[switchType]);
}

function checkUps() {
	if (config.get('devMode')) return;
	let Ups = ups();
	logger.log('Getting UPS status', 'A');
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
			logger.warn(`Cannot reach UPS on: ${ip}`, error);
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
				cachedUpsTemps[Ups[i].Name] = Ups[i].temp;
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
	logger.log('Checking device lists for missing devices', 'A');
	const Devices = devices();
	const missingDevices = {};
	let expectedDevices = [];
	if (fromList) {
		for (let i in Devices) {
			expectedDevices = [...new Set([...expectedDevices, ...parseTempalteString(Devices[i].name)])];
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

function doApi(request, Switch) {
	const ip = Switch.IP;
	const user = Switch.User;
	const pass = Switch.Pass;
	const OS = Switch.OS;
	let endPoint = '';
	let protocol = 'http';
	if (!SwitchRequests[OS][request]) return;

	const options = {
		method: 'POST',
		headers: {
			'content-type': 'application/json-rpc',
			'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
		},
		body: JSON.stringify(SwitchRequests[OS][request]),
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
	logger.log(`Polling switch API endpoint ${protocol}://${ip}/${endPoint} for data`, 'D');

	return fetch(`${protocol}://${ip}/${endPoint}`, options).then((response) => {
		if (response.status === 200) {
			return response.json().then((jsonRpcResponse) => { return jsonRpcResponse; });
		}
	}).catch((error)=>{
		logger.log(`Failed to connect to switch on: ${ip}`, 'E');
		logger.object(error, 'D');
	});
}


/* Control Functions */

function localPings() {
	if (config.get('devMode')) return;
	const hosts = pings();
	hosts.forEach(function (host) {
		ping.promise.probe(host.IP, {
			timeout: 10
		}).then(function(res) {
			logger.log(`IP: ${host.IP}, Online: ${res.alive}`, 'A');
			distributeData('localPing', {
				'status':res.alive,
				'IP':host.IP,
				'Name':host.Name,
				'SSH':host.SSH,
				'HTTP':host.HTTP,
				'HTTPS':host.HTTPS
			});
		});
	});
}


/* Web Logging Functions */


async function logTemp() {
	if (config.get('devMode')) return;
	let Temps = temps();
	logger.log('Getting temperatures', 'A');

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
			logger.warn(`Cannot reach sensor on: ${sensor.IP}`, error);
		}
	}

	if (promises.length < 1) return;
	const results = await Promise.allSettled(promises);
	logger.log('Got temperature data, processing', 'D');
	let tempSum = 0;
	let tempValid = 0;
	const socketSend = {};

	for (let index = 0; index < Temps.length; index++) {
		const sensorData = results[index];

		if (sensorData.status == 'fulfilled') {
			try {				
				let temp = 0;
				const sensorStatData = sensorData.value.split('<p><b>Temperature In:</b></p>');
				if (typeof sensorStatData[1] == 'undefined') return;
				const sensorStat = sensorStatData[1].slice(25,27);
				if (sensorStat == 'OK') {
					let unfilteredTemp = sensorData.value.split('<p><b>Temperature In:</b></p>')[1].slice(29,33);
					temp = parseInt(unfilteredTemp.substring(0, unfilteredTemp.indexOf(')')));
				} else {
					logger.log(`${Temps[index].Name} sensor temperature is not OK`, 'W');
				}
				Temps[index].Temp = temp;
				tempSum += temp;
				tempValid++;
				logger.log(`${Temps[index].Name} temperature = ${temp} deg C`, 'D');
				if (config.get('localDataBase')) SQL.insert({
					'sensor': Temps[index].Name,
					'sensorType': 'IQ Frame',
					'temperature': Temps[index].Temp,
					'system': config.get('systemName')
				}, 'temperature');
				socketSend[Temps[index].Name] = Temps[index].Temp;
			} catch (error) {
				logger.object(`Error processing data for from: '${Temps[index].Name}'`, error, 'W');
			}
		} else {
			logger.log(`Can't connect to sensor: '${Temps[index].Name}'`, 'W');
		}
	}

	let tempAvg;

	if (tempValid == 0) {
		logger.log('Invalid temperature measured connections must have failed', 'E');
		sendSms('Cannot connect to sensor, it haseither failed or the network is broken');
	} else {
		tempAvg = tempSum / tempValid;
		logger.log(`Average temperature = ${tempAvg} deg C`, 'D');
		logger.log(`Warning temperature = ${config.get('warningTemperature')} deg C`, 'D');

		if (tempAvg > config.get('warningTemperature')) {
			logger.log('Warning: Temperature over warning limit, sending SMS', 'W');
			sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`);
		}
		sendCloudData({'command':'log', 'type':'temperature', 'data':Temps});

		socketSend.average = tempAvg;
		const time = new Date().getTime();
		const points = {};
		points[time] = socketSend;
		webServer.sendToAll({
			'command': 'data',
			'data': 'temps',
			'type': 'IQ Frame',
			'system': config.get('systemName'),
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
			logger.warn(`Cannot reach sensor on: ${sensor.IP}`, error);
		}
	}

	if (promises.length < 1) return;

	const results = await Promise.allSettled(promises);
	logger.log('Got temperature data, processing', 'D');
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
					logger.log(`${sensor.Location} temperature = ${Number(sensor.Temperature)} deg C`, 'D');
					if (config.get('localDataBase')) SQL.insert({
						'sensor': sensor.Location,
						'sensorType': 'Will N Sensor',
						'temperature': Number(sensor.Temperature),
						'system': config.get('systemName')
					}, 'temperature');
					socketSend[sensor.Location] = Number(sensor.Temperature);
				} catch (error) {
					logger.object(`Error processing data for from: '${sensor.Location}'`, error, 'W');
				}
			}
		} else {
			logger.log(`Can't connect to sensor: '${Temps[index].Name}'`, 'W');
		}
	}

	Object.keys(cachedUpsTemps).forEach(upsName => {
		tempValid++;
		logger.log(`${upsName} temperature = ${Number(cachedUpsTemps[upsName])} deg C`, 'D');
		if (config.get('localDataBase')) SQL.insert({
			'sensor': upsName,
			'sensorType': 'Will N Sensor',
			'temperature': Number(cachedUpsTemps[upsName]),
			'system': config.get('systemName')
		}, 'temperature');
		socketSend[upsName] = Number(cachedUpsTemps[upsName]);
		webTemps.push({
			'Temp': Number(cachedUpsTemps[upsName]),
			'Name': upsName,
			'IP': Temps[index].IP,
			'Type': 'Will N Sensor'
		})
	})

	let tempAvg;

	if (tempValid == 0) {
		logger.log('Invalid temperature measured connections must have failed', 'E');
		sendSms('Cannot connect to sensor, it haseither failed or the network is broken');
	} else {
		tempAvg = tempSum / tempValid;
		logger.log(`Average temperature = ${tempAvg} deg C`, 'D');
		logger.log(`Warning temperature = ${config.get('warningTemperature')} deg C`, 'D');

		if (tempAvg > config.get('warningTemperature')) {
			logger.log('Warning: Temperature over warning limit, sending SMS', 'W');
			sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`);
		}
		sendCloudData({'command':'log', 'type':'temperature', 'data':webTemps});

		socketSend.average = tempAvg;
		const time = new Date().getTime();
		const points = {};
		points[time] = socketSend;
		webServer.sendToAll({
			'command': 'data',
			'data': 'temps',
			'type': 'Will N Sensor',
			'system': config.get('systemName'),
			'replace': false,
			'points': points
		});
	}
}

function webLogPing() {
	if (!config.get('webEnabled')) return;
	logger.log('Pinging webserver', 'A');
	sendCloudData({'command':'log', 'type':'ping'});
}

function webLogBoot() {
	if (!config.get('webEnabled')) return;
	logger.log('Sending boot');
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
		logger.log(`Text message sent - messageId: ${data.MessageId}`);
	}).catch(function (err) {
		logger.error(err, err.stack);
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
			logger.log(`Retrying connection to dead server: ${logger.r}${protocol}://${cloudServer.address}${logger.reset}`, 'W');
		}
		cloudServer.socket = new WebSocket(`${protocol}://${cloudServer.address}`);

		promise = new Promise(resolve=>{
			cloudServer.socket.on('open', function open() {
				let payload = {};
				payload.command = 'register';
				payload.name = config.get('systemName');
				sendCloudData(payload);
				resolve();
				logger.log(`${logger.g}${cloudServer.address}${logger.reset} Established a connection to webserver`, 'S');
				cloudServer.connected = true;
				cloudServer.active = true;
				cloudServer.attempts = 0;
			});
		});

		cloudServer.socket.on('message', function message(msgJSON) {
			try {
				const msgObj = JSON.parse(msgJSON);
				if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
					logger.object('Received from other server', msgObj, 'A');
				} else if (config.get('printPings') == true) {
					logger.object('Received from other server', msgObj, 'A');
				}
				switch (msgObj.payload.command) {
				case 'ping':
					sendCloudData({
						'command': 'pong'
					});
					break;
				case 'data':
					logger.log('Recieved temp/ping data from server', 'D');
					break;
				default:
					logger.object('Received unknown from other server', msgObj, 'W');
				}
			} catch (e) {
				try {
					const msgObj = JSON.parse(msgJSON);
					if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
						logger.object('Received from other server', msgObj, 'A');
					} else if (config.get('printPings') == true) {
						logger.object('Received from other server', msgObj, 'A');
					}
					if (typeof msgObj.type == 'undefined') {
						let stack = e.stack.toString().split(/\r\n|\n/);
						stack = JSON.stringify(stack, null, 4);
						logger.log(`Server error, stack trace: ${stack}`, 'E');
					} else {
						logger.log('A device is using old \'chiltv\' data format, upgrade it to v4.0 or above', 'E');
					}
				} catch (e2) {
					logger.log('Invalid JSON from other server- '+e, 'E');
					logger.object('Received from other server', JSON.parse(msgJSON), 'A');
				}
			}
		});

		cloudServer.socket.on('close', function close() {
			cloudServer.connected = false;
			delete cloudServer.socket;
			cloudServer.attempts++;
			if (!inError) {
				logger.log(`${logger.r}${cloudServer.address}${logger.reset} Outbound webserver connection closed`, 'W');
			}
		});

		cloudServer.socket.on('error', function error() {
			inError = true;
			logger.log(`Could not connect to server: ${logger.r}${cloudServer.address}${logger.reset}`, 'E');
		});
		
	} else if (!cloudServer.connected && cloudServer.active) {
		cloudServer.active = false;
		logger.log(`Server not responding, changing status to dead: ${logger.r}${cloudServer.address}${logger.reset}`, 'E');
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
	logger.setConf({
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

async function startLoopAfterDelay(callback, seconds, ...arguments) {
	setInterval(callback, seconds * 1000, ...arguments);
	callback(...arguments);
	logger.log('Starting '+callback.name, 'A');
	await sleep(1);
}

async function sleep(seconds) {
	await new Promise (resolve => setTimeout(resolve, 1000*seconds));
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
		const interfaces = result.result[0].interfaces;
		for (let interfaceName in interfaces) {
			const interface = interfaces[interfaceName];
			if ('rxPower' in interface === false) continue
			if (!keys.includes(interfaceName)) devices[interfaceName] = {};
			devices[interfaceName].port = interfaceName;
			devices[interfaceName].description = getDescription(interfaceName, switchType, switchName);
			devices[interfaceName].rxPower = interface.rxPower.toFixed(1);
			if ('txPower' in interface) devices[interfaceName].txPower = interface.txPower.toFixed(1);
		}
		for (let deviceName in devices) {
			const device = devices[deviceName];
			if ('txPower' in device === false) continue;
			if ('rxPower' in device === false) continue;
			if (device.rxPower < -9 && device.rxPower > -30 && device.txPower > -30) {
				device.switch = switchName;
				filteredDevices.push(device);
			}
		}
	},
	handleFlap: (filteredDevices, result, switchType, switchName) => {
		let devices = data.neighbors[switchType][switchName];
		const keys = Object.keys(devices);
		const split = result.result[1].output.split('\n');
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
			if (!keys.includes(mac.int)) devices[mac.int] = {};
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
			if(!('lastChange' in device.mac)) logger.log(device+' seems to have an issue','W');
			const time = device.mac.lastChange.split(':');
			const timeTotal = parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2]);
			if (timeTotal > 300) continue;
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
		data.interfaces[switchType][switchName] = {};
		for (const interfaceName in interfaces) {
			if (interfaces.hasOwnProperty.call(interfaces, interfaceName)) {
				const interface = interfaces[interfaceName];
				if (interface.hardware !== "ethernet") continue;
				data.interfaces[switchType][switchName][interfaceName] = {
					"connected": interface.interfaceStatus == "connected" ? true : false,
					"description": interface.description,
					"inRate": interface.interfaceStatistics.inBitsRate,
					"outRate": interface.interfaceStatistics.outBitsRate,
					"maxRate": interface.bandwidth,
					"lastFlap": interface.lastStatusChangeTimestamp,
					"flapCount": interface.interfaceCounters.linkStatusChanges,
					"outErrors": interface.interfaceCounters.totalOutErrors,
					"outDiscards": interface.interfaceCounters.outDiscards,
					"inErrors": interface.interfaceCounters.totalInErrors,
					"inDiscards": interface.interfaceCounters.inDiscards
				}
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
			const interface = interfaces[interfaceNum];
			const interfaceName = interface.interface;
			if (interface.TABLE_lane === undefined) continue;
			const lanes = Array.isArray(interface.TABLE_lane.ROW_lane) ? interface.TABLE_lane.ROW_lane : [interface.TABLE_lane.ROW_lane];
			for (let laneNumber = 0; laneNumber < lanes.length; laneNumber++) {
				const lane = lanes[laneNumber];
				const interfaceLaneName = lanes.length > 1 ? `${interfaceName}/${laneNumber+1}` : interfaceName;
				if ('rx_pwr' in lane === false) continue
				if (!keys.includes(interfaceLaneName)) devices[interfaceLaneName] = {};
				devices[interfaceLaneName].port = interfaceLaneName;
				devices[interfaceLaneName].description = getDescription(interfaceLaneName, switchType, switchName);
				devices[interfaceLaneName].rxPower = Number(lane.rx_pwr).toFixed(1);
				if ('tx_pwr' in lane) devices[interfaceLaneName].txPower = Number(interface.tx_pwr).toFixed(1);
			}
		}
		for (let deviceNumber in devices) {
			const device = devices[deviceNumber];
			if ('txPower' in device === false) continue;
			if ('rxPower' in device === false) continue;
			if (device.rxPower > -11) continue;
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
			if(!('lastChange' in device.mac)) logger.log(device+' seems to have an issue','W');
			const time = device.mac.lastChange.split(':');
			const timeTotal = parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2]);
			if (timeTotal > 300) continue;
			device.switch = switchName;
			filteredDevices.push(device);
		}
	},
	handlePower: (result, switchType, switchName) => {
		logger.object(result);
	},
	handleTemperature: (result, switchType, switchName) => {
		logger.object(result);
	},
	handleFans: (result, switchType, switchName) => {
		logger.object(result);
	},
	handleInterfaces: (result, switchType, switchName) => {
		const interfaces = result.result.body.TABLE_interface.ROW_interface;
		data.interfaces[switchType][switchName] = {};
		interfaces.forEach(interface => {
			const interfaceName = interface.interface;
			data.interfaces[switchType][switchName][interfaceName] = {
				"connected": interface.state == "up" ? true : false,
				"description": interface.desc,
				"inRate": interface.eth_inrate1_bits,
				"outRate": interface.eth_outrate1_bits,
				"maxRate": interface.eth_bw,
				"lastFlap": interface.eth_link_flapped,
				"flapCount": 1,
				"outErrors": interface.eth_outerr,
				"outDiscards": interface.eth_outdiscard,
				"inErrors": interface.eth_inerr,
				"inDiscards": interface.eth_indiscard
			}
		})
	}
}



/* 
const session = snmp.createSession("10.10.21.1", "private");

const oids = ["1.3.6.1.2.1.1.5.0", "1.3.6.1.2.1.1.6.0"];

session.get(oids, function (error, varbinds) {
    if (error) {
        logger.error(error);
    } else {
        for (var i = 0; i < varbinds.length; i++) {
            if (snmp.isVarbindError(varbinds[i])) {
                logger.error(snmp.varbindError(varbinds[i]));
            } else {
                logger.log(varbinds[i].oid + " = " + varbinds[i].value);
            }
        }
    }
    session.close();
});
*/