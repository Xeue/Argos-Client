const serverID = new Date().getTime()

import {WebSocket, WebSocketServer} from 'ws'
import http from 'http'
import express from 'express'
import fetch from 'node-fetch'
import axios from 'axios'
import AWS from 'aws-sdk'
import fs from 'fs'
import mariadb from 'mariadb'
import { Buffer } from 'node:buffer'
import {log, logObj, logs} from 'xeue-logs'
import config from 'xeue-config'
import process from 'process'

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
const require = createRequire(import.meta.url)
const {version} = require('./package.json')
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)



{ /* Config */
	logs.printHeader('Argos Monitoring')
	config.useLogger(logs)

	config.require('port', [], 'What port shall the server use')
	config.require('systemName', [], 'What is the name of the system')
	config.require('warningTemperature', [], 'What temperature shall alerts be sent at')
	config.require('webEnabled', [true, false], 'Should this system report back to an argos server')
	{
		config.require('webSocketEndpoint', [], 'What is the url of the argos server', ['webEnabled', true])
	}
	config.require('localDataBase', [true, false], 'Setup and use a local database to save warnings and temperature information')
	{
		config.require('dbUser', [], 'Database Username', ['localDataBase', true])
		config.require('dbPass', [], 'Database Password', ['localDataBase', true])
		config.require('dbPort', [], 'Database port', ['localDataBase', true])
		config.require('dbHost', [], 'Database address', ['localDataBase', true])
		config.require('dbName', [], 'Database name', ['localDataBase', true])
	}
	config.require('textsEnabled', [true, false], 'Use AWS to send texts when warnings are triggered')
	{
		config.require('awsAccessKeyId', [], 'AWS access key for texts', ['textsEnabled', true])
		config.require('awsSecretAccessKey', [], 'AWS Secret access key for texts', ['textsEnabled', true])
		config.require('awsRegion', [], 'AWS region', ['textsEnabled', true])
	}
	config.require('loggingLevel', ['A', 'D', 'W', 'E'], 'Set logging level')
	config.require('createLogFile', [true, false], 'Save logs to local file')

	config.default('port', 8080)
	config.default('systemName', 'Unknown')
	config.default('warningTemperature', 35)
	config.default('webEnabled', false)
	config.default('localDataBase', false)
	config.default('dbPort', '3306')
	config.default('dbName', 'argosdata')
	config.default('dbHost', 'localhost')
	config.default('textsEnabled', false)
	config.default('loggingLevel', 'W')
	config.default('createLogFile', true)
	config.default('debugLineNum', false)
	config.default('printPings', false)
	config.default('devMode', false)

	if (!await config.fromFile(__dirname + '/config.conf')) {
		await config.fromCLI(__dirname + '/config.conf')
	}

	if (config.get('textsEnabled')) {
		AWS.config.update({ region: config.get('awsRegion')})
		AWS.config.credentials = new AWS.Credentials(config.get('awsAccessKeyId'), config.get('awsSecretAccessKey'))
	}

	logs.setConf({
		'createLogFile': config.get('createLogFile'),
		'logsFileName': 'ArgosLogging',
		'configLocation': __dirname,
		'loggingLevel': config.get('loggingLevel'),
		'debugLineNum': config.get('debugLineNum'),
	})
	log('Running version: v'+version, ['H', 'SERVER', logs.g])
	config.print()
	config.userInput(async (command)=>{
		switch (command) {
		case 'config':
			await config.fromCLI(__dirname + '/config.conf')
			logs.setConf({
				'createLogFile': config.get('createLogFile'),
				'logsFileName': 'CreditsLogging',
				'configLocation': __dirname,
				'loggingLevel': config.get('loggingLevel'),
				'debugLineNum': config.get('debugLineNum')
			})
			break
		}
	})
}

const webServer = {
	'connected': false,
	'active': false,
	'attempts': 0,
	'address': config.get('webSocketEndpoint'),
	'socket': null
}
const data = {
	'neighbors': {},
	'fibre':{},
	'phy': {},
	'mac': {},
	'ups': {},
	'devices':{}
}

const pingFrequency = 30
const lldpFrequency = 30
const switchStatsFrequency = 30
const upsFrequency = 30
const devicesFrequency = 30
const tempFrequency = minutes(5)


/* Data */


function loadData(file) {
	try {
		let dataRaw = fs.readFileSync(`${__dirname}/data/${file}.json`)
		let data
		try {
			data = JSON.parse(dataRaw)
			return data
		} catch (error) {
			logObj(`There is an error with the syntax of the JSON in ${file}.json file`, error, 'E')
			return []
		}
	} catch (error) {
		logObj(`Cloud not read the file ${file}.json, attempting to create new file`, error, 'W')
		let fileData = []
		switch (file) {
		case 'Devices':
			fileData[0] = {
				'name':'Placeholder',
				'description':'Placeholder'
			}
			break
		case 'Switches':
			fileData[0] = {
				'Name':'Placeholder',
				'User': 'Username',
				'Pass': 'Password',
				'IP':'0.0.0.0'
			}
			break
		default:
			fileData[0] = {
				'Name':'Placeholder',
				'IP':'0.0.0.0'
			}
			break
		}
		if (!fs.existsSync(`${__dirname}/data/`)){
			fs.mkdirSync(`${__dirname}/data/`)
		}
		fs.writeFileSync(`${__dirname}/data/${file}.json`, JSON.stringify(fileData, null, 4))
		return fileData
	}
}
function writeData(file, data) {
	try {
		fs.writeFileSync(`${__dirname}/data/${file}.json`, JSON.stringify(data, undefined, 2))
	} catch (error) {
		logObj(`Cloud not write the file ${file}.json, do we have permission to access the file?`, error, 'E')
	}
}

function switches(object) {
	if (typeof object === 'undefined') {
		return loadData('Switches')
	} else {
		writeData('Switches', object)
	}
}
function frames(object) {
	if (typeof object === 'undefined') {
		return loadData('Frames')
	} else {
		writeData('Frames', object)
	}
}
function ups(object) {
	if (typeof object === 'undefined') {
		return loadData('Ups')
	} else {
		writeData('Ups', object)
	}
}
function devices(object) {
	if (typeof object === 'undefined') {
		return loadData('Devices')
	} else {
		writeData('Devices', object)
	}
}


/* Express setup & Websocket Server */


function startHTTP() {
	const app = express()
	const server = http.createServer(app)

	app.set('views', __dirname + '/views')
	app.set('view engine', 'ejs')
	app.use(express.json())
	app.use(express.static('public'))

	app.get('/',  (req, res) =>  {
		log('New client connected', 'A')
		res.header('Content-type', 'text/html')
		res.render('ui', {
			switches:switches(),
			systemName:config.get('systemName'),
			webSocketEndpoint:config.get('webSocketEndpoint'),
			webEnabled:config.get('webEnabled'),
			version: version
		})
	})

	app.get('/broken', (req, res) => {
		res.send('no')
	})

	app.get('/fibre', (req, res) => {
		log('Request for fibre data', 'D')
		res.send(JSON.stringify(data.fibre))
	})

	app.get('/ups', (req, res) => {
		log('Request for UPS data', 'D')
		res.send(JSON.stringify(data.ups))
	})

	app.get('/phy', (req, res) => {
		log('Request for PHY/FEC data', 'D')
		res.send(JSON.stringify(data.phy))
	})

	app.get('/mac', (req, res) => {
		log('Request for mac/flap data', 'D')
		res.send(JSON.stringify(data.mac))
	})

	app.get('/devices', (req, res) => {
		log('Request for devices data', 'D')
		res.send(JSON.stringify(data.devices))
	})

	app.get('/getConfig', (req, res) => {
		log('Request for devices config', 'D')
		let catagory = req.query.catagory
		let data
		switch (catagory) {
		case 'switches':
			data = switches()
			break
		case 'frames':
			data = frames()
			break
		case 'ups':
			data = ups()
			break
		case 'devices':
			data = devices()
			break
		default:
			break
		}
		res.send(JSON.stringify(data))
	})

	app.post('/setswitches', (req, res) => {
		log('Request to set switches config data', 'D')
		switches(req.body)
		res.send('Done')
	})
	app.post('/setdevices', (req, res) => {
		log('Request to set devices config data', 'D')
		devices(req.body)
		res.send('Done')
	})
	app.post('/setups', (req, res) => {
		log('Request to set ups config data', 'D')
		ups(req.body)
		res.send('Done')
	})
	app.post('/setframes', (req, res) => {
		log('Request to set frames config data', 'D')
		frames(req.body)
		res.send('Done')
	})
	return server
}

const serverWS = new WebSocketServer({ noServer: true })
const serverHTTP = startHTTP()

serverHTTP.listen(config.get('port'))
log(`Argos can be accessed at http://localhost:${config.get('port')}`, 'C')

serverHTTP.on('upgrade', (request, socket, head) => {
	log('Upgrade request received', 'D')
	serverWS.handleUpgrade(request, socket, head, socket => {
		serverWS.emit('connection', socket, request)
	})
})

// Main websocket server functionality
serverWS.on('connection', async socket => {
	log('New client connected', 'D')
	socket.pingStatus = 'alive'
	socket.on('message', async (msgJSON)=>{
		await onWSMessage(msgJSON, socket)
	})
	socket.on('close', ()=>{
		onWSClose(socket)
	})
})

serverWS.on('error', () => {
	log('Server failed to start or crashed, please check the port is not in use', 'E')
	process.exit(1)
})

async function onWSMessage(msgJSON, socket) {
	let msgObj = {}
	try {
		msgObj = JSON.parse(msgJSON)
		if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
			logObj('Received', msgObj, 'A')
		}
		const payload = msgObj.payload
		const header = msgObj.header
		if (typeof payload.source == 'undefined') {
			payload.source = 'default'
		}
		switch (payload.command) {
		case 'meta':
			log('Received: '+msgJSON, 'D')
			socket.send('Received meta')
			break
		case 'register':
			coreDoRegister(socket, msgObj)
			break
		case 'disconnect':
			log(`${logs.r}${payload.data.ID}${logs.reset} Connection closed`, 'D')
			break
		case 'pong':
			socket.pingStatus = 'alive'
			break
		case 'ping':
			socket.pingStatus = 'alive'
			sendClientData(socket, {
				'command': 'pong'
			})
			break
		case 'error':
			log(`Device ${header.fromID} has entered an error state`, 'E')
			log(`Message: ${payload.error}`, 'E')
			break
		case 'get':
			getTemperature(header, payload).then(data => {
				sendClientData(socket, data)
			})
			break
		default:
			log('Unknown message: '+msgJSON, 'W')
		}
	} catch (e) {
		try {
			msgObj = JSON.parse(msgJSON)
			if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
				logObj('Received', msgObj, 'A')
			}
			if (typeof msgObj.type == 'undefined') {
				logObj('Server error', e, 'E')
			} else {
				log('A device is using old tally format, upgrade it to v4.0 or above', 'E')
			}
		} catch (e2) {
			logObj('Invalid JSON', e, 'E')
			log('Received: '+msgJSON, 'A')
		}
	}
}

async function getTemperature(header, payload) {
	log(`Getting temps for ${header.system}`, 'D')
	let from = payload.from
	let to = payload.to
	let dateQuery = `SELECT ROW_NUMBER() OVER (ORDER BY PK) AS Number, \`PK\`, \`time\` FROM \`temperature\` WHERE time BETWEEN FROM_UNIXTIME(${from}) AND FROM_UNIXTIME(${to}) AND \`system\` = '${header.system}' GROUP BY \`time\`; `

	if (!config.get('localDataBase')) return {
		'command':'data',
		'data':'temps',
		'system':header.system,
		'replace': true,
		'points':{}
	}

	const grouped = await db.query(dateQuery)

	let divisor = Math.ceil(grouped.length/1000)
	let whereArr = grouped.map((a)=>{
		if (parseInt(a.Number) % parseInt(divisor) == 0) {
			let data = new Date(a.time).toISOString().slice(0, 19).replace('T', ' ')
			return `'${data}'`
		}
	}).filter(Boolean)
	let whereString = whereArr.join(',')
	let query
	if (whereString == '') {
		query = `SELECT * FROM \`temperature\` WHERE \`system\` = '${header.system}' ORDER BY \`PK\` ASC LIMIT 1; `
	} else {
		query = `SELECT * FROM \`temperature\` WHERE time IN (${whereString}) AND \`system\` = '${header.system}' ORDER BY \`PK\` ASC; `
	}

	const rows = await db.query(query)

	const dataObj = {
		'command':'data',
		'data':'temps',
		'system':header.system,
		'replace': true,
		'points':{}
	}

	rows.forEach((row) => {
		let timestamp = row.time.getTime()
		if (!dataObj.points[timestamp]) {
			dataObj.points[timestamp] = {}
		}
		let point = dataObj.points[timestamp]
		point[row.frame] = row.temperature

		delete point.average
		const n = Object.keys(point).length
		const values = Object.values(point)
		const total = values.reduce((accumulator, value) => {
			return accumulator + value
		}, 0)
		point.average = total/n
	})

	return dataObj
}

function onWSClose(socket) {
	try {
		let oldId = JSON.parse(JSON.stringify(socket.ID))
		log(`${logs.r}${oldId}${logs.reset} Connection closed`, 'D')
		socket.connected = false
	} catch (e) {
		log('Could not end connection cleanly','E')
	}
}

function doPing() {
	let counts = {}
	counts.alive = 0
	counts.dead = 0
	serverWS.clients.forEach(function each(client) {
		if (client.readyState === 1) {
			if (client.pingStatus == 'alive') {
				counts.alive++
				let payload = {}
				payload.command = 'ping'
				sendClientData(client, payload)
				client.pingStatus = 'pending'
			} else if (client.pingStatus == 'pending') {
				client.pingStatus = 'dead'
			} else {
				counts.dead++
			}
		}
	})
}

function coreDoRegister(socket, msgObj) {
	const header = msgObj.header
	if (typeof socket.type == 'undefined') {
		socket.type = header.type
	}
	if (typeof socket.ID == 'undefined') {
		socket.ID = header.fromID
	}
	if (typeof socket.version == 'undefined') {
		socket.version = header.version
	}
	if (typeof socket.prodID == 'undefined') {
		socket.prodID = header.prodID
	}
	if (header.version !== version) {
		if (header.version.substr(0, header.version.indexOf('.')) != version.substr(0, version.indexOf('.'))) {
			log('Connected client has different major version, it will not work with this server!', 'E')
		} else {
			log('Connected client has differnet version, support not guaranteed', 'W')
		}
	}
	log(`${logs.g}${header.fromID}${logs.reset} Registered as new client`, 'D')
	socket.connected = true
}

function sendClientData(connection, payload) {
	connection.send(JSON.stringify({
		'header': makeHeader(),
		'payload': payload
	}))
}

function makeHeader() {
	const header = {}
	header.fromID = serverID
	header.timestamp = new Date().getTime()
	header.version = version
	header.type = 'Server'
	header.active = true
	header.messageID = header.timestamp
	header.recipients = []
	return header
}

/* Request definitions */


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
}
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
}
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
}
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
}


/* Switch poll functions */


function lldpLoop() {
	let Switches = switches()
	log('Getting LLDP neighbors', 'A')
	let promisses = []
	for (let i = 0; i < Switches.length; i++) {
		let Switch = Switches[i]
		promisses.push(doApi(lldpRequest, Switch))
	}
	return Promise.all(promisses).then((values) => {
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let neighbors = values[i].result[1].lldpNeighbors
				data.neighbors[Switches[i].Name] = {}
				let thisSwitch = data.neighbors[Switches[i].Name]
				for (let j in neighbors) {
					let t = neighbors[j]
					if (!t.port.includes('Ma')) {
						thisSwitch[t.port] = { lldp: t.neighborDevice }
					}
				}
			} else {
				log(`(LLDP) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W')
			}
		}
		sendData({'command':'log', 'type':'lldp', 'data':data.neighbors})
	})
}

function switchMac() {
	let Switches = switches()
	log('Checking for recent interface dropouts', 'A')
	function processSwitchMac(response, devices) {
		let keys = Object.keys(devices)
		let split = response.result[1].output.split('\n')
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

			if (mac.config == 'Up') {
				if (!keys.includes(mac.int)) {
					devices[mac.int] = {}
				}
				devices[mac.int].mac = {}
				devices[mac.int].mac.operState = mac.oper
				devices[mac.int].mac.phyState = mac.phy
				devices[mac.int].mac.macFault = mac.mac
				devices[mac.int].mac.lastChange = mac.last
				devices[mac.int].description = getDescription(devices[mac.int].lldp)
				devices[mac.int].port = mac.int
			}
		}
		return devices
	}

	let promisses = []
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi(macRequest, Switches[i]))
	}
	return Promise.all(promisses).then((values) => {
		let filteredDevices = []
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let procDev = clearEmpties(processSwitchMac(values[i], data.neighbors[Switches[i].Name]))

				for (let dev in procDev) {
					if (typeof procDev[dev].mac !== 'undefined') {
						if(!('lastChange' in procDev[dev].mac)) {
							log(procDev[dev]+' seems to have an issue','W')
						}
						let time = procDev[dev].mac.lastChange.split(':')
						let timeTotal = parseInt(time[0]) * 3600 + parseInt(time[1]) * 60 + parseInt(time[2])
						if (timeTotal < 300) {
							procDev[dev].switch = Switches[i].Name
							filteredDevices.push(procDev[dev])
						}
					}
				}

			} else {
				log(`(MAC) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W')
			}
		}
		data.mac = filteredDevices
		sendData({'command':'log', 'type':'mac', 'data':data.mac})
	})
}

function switchPhy() {
	const Switches = switches()
	log('Looking for high numbers of PHY/FEC errors', 'A')
	function processSwitchPhy(response, devices) {
		const statuses = response.result[1].interfacePhyStatuses
		const keys = Object.keys(devices)
		for (let portName in statuses) {
			if (!keys.includes(portName)) {
				devices[portName] = {}
			}
			const port = statuses[portName]
			const fec = port.phyStatuses[0].fec
			if (fec?.encoding == 'reedSolomon') {
				if (fec.uncorrectedCodewords.value > 100) {
					devices[portName].phy = {}
					devices[portName].phy.current = fec.uncorrectedCodewords.value
					devices[portName].phy.changes = fec.uncorrectedCodewords.changes
					devices[portName].phy.lastChange = fec.uncorrectedCodewords.lastChange
					devices[portName].port = portName
					devices[portName].description = getDescription(devices[portName].lldp)
				}
			} else if (fec?.encoding == 'fireCode') {
				if (fec.perLaneUncorrectedFecBlocks[0].value > 100) {
					devices[portName].phy = {}
					devices[portName].phy.current = fec.perLaneUncorrectedFecBlocks[0].value
					devices[portName].phy.changes = fec.perLaneUncorrectedFecBlocks[0].changes
					devices[portName].phy.lastChange = fec.perLaneUncorrectedFecBlocks[0].lastChange
					devices[portName].port = portName
					devices[portName].description = getDescription(devices[portName].lldp)
				}
			}
		}
		return devices
	}

	let promisses = []
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi(phyRequest, Switches[i]))
	}
	return Promise.all(promisses).then((values) => {
		let filteredDevices = []
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let procDev = processSwitchPhy(values[i], data.neighbors[Switches[i].Name])

				for (let dev in procDev) {
					if ('phy' in procDev[dev]) {
						procDev[dev].switch = Switches[i].Name
						filteredDevices.push(procDev[dev])
						//}
					}
				}
			} else {
				log(`(PHY) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W')
			}
		}
		data.phy = filteredDevices
		sendData({'command':'log', 'type':'phy', 'data':data.phy})
	})
}

function switchFibre() {
	let Switches = switches()
	log('Looking for low fibre levels in trancievers', 'A')
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
				devices[i].description = getDescription(devices[i].lldp)
				devices[i].rxPower = int.rxPower.toFixed(1)
				if ('txPower' in int)
					devices[i].txPower = int.txPower.toFixed(1)
			}
		}
		return devices
	}

	let promisses = []
	for (let i = 0; i < Switches.length; i++) {
		promisses.push(doApi(fibreRequest, Switches[i]))
	}
	return Promise.all(promisses).then((values) => {
		let filteredDevices = []
		for (let i = 0; i < values.length; i++) {
			if (typeof values[i] !== 'undefined') {
				let procDev = processSwitchFibre(values[i], data.neighbors[Switches[i].Name])

				for (let dev in procDev) {
					if ('txPower' in procDev[dev] && 'rxPower' in procDev[dev]) {
						if (procDev[dev].rxPower < -9 && procDev[dev].rxPower > -30 && procDev[dev].txPower > -30) {
							procDev[dev].switch = Switches[i].Name
							filteredDevices.push(procDev[dev])
						}
					}
				}
			} else {
				log(`(TRANS) Return data from switch: '${Switches[i].Name}' empty, is the switch online?`, 'W')
			}
		}
		data.fibre = filteredDevices
		sendData({'command':'log', 'type':'mac', 'data':data.fibre})
	})
}

function checkUps() {
	let Ups = ups()
	log('Getting UPS status', 'A')
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
					}
				})
			}
		})
	}

	let promises = []
	for (let index = 0; index < Ups.length; index++) {
		promises.push(getUpsStatus(Ups[index].IP))
	}

	return Promise.allSettled(promises).then((values) => {
		let filteredUps = []

		for (let i = 0; i < Ups.length; i++) {
			if (values[i].status === 'rejected' || typeof values[i].value == 'undefined') {
				Ups[i].Status = 'Offline'
				if (!Ups[i].linePresent || !Ups[i].outputPowered || Ups[i].load > 80) {
					filteredUps.push(Ups[i])
				}
			} else {
				values[i].value.name = Ups[i].Name
				delete values[i].value.ip
				Ups[i] = values[i].value
				Ups[i].Status = 'Online'
			}
		}
		data.ups = filteredUps
		sendData({'command':'log', 'type':'mac', 'data':data.ups})
	})
}

function checkDevices() {
	log('Checking device lists for missing devices', 'A')
	let Devices = devices()
	let missingDevices = {}
	let expectedDevices = []
	for (let i in Devices) {
		expectedDevices = [...new Set([...expectedDevices, ...parseTempalteString(Devices[i].name)])]
	}

	for (const Switch in data.neighbors) {
		if (Object.hasOwnProperty.call(data.neighbors, Switch)) {
			let lldpNeighborsObj = data.neighbors[Switch]
			let lldpNeighbors = []
			for (let port in lldpNeighborsObj) {
				let Neighbor = lldpNeighborsObj[port]
				if (Neighbor.lldp) {
					lldpNeighbors.push(Neighbor.lldp)
				}
			}
			const missingSwitchDevices = expectedDevices.filter(x => !lldpNeighbors.includes(x))
			for (let index = 0; index < missingSwitchDevices.length; index++) {
				const device = missingSwitchDevices[index]
				if (typeof missingDevices[device] === 'undefined') {
					missingDevices[device] = []
				}
				missingDevices[device].push(Switch)
			}
		}
	}
	data.devices = missingDevices
	sendData({'command':'log', 'type':'mac', 'data':data.devices})
}

function doApi(json, Switch) {
	const ip = Switch.IP
	const user = Switch.User
	const pass = Switch.Pass
	log(`Polling switch API endpoint http://${ip}/command-api for data`, 'D')
	return fetch(`http://${ip}/command-api`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
		},
		body: JSON.stringify(json),
	}).then((response) => {
		if (response.status === 200) {
			return response.json().then((jsonRpcResponse) => { return jsonRpcResponse })
		}
	}).catch((error)=>{
		logObj(`Failed to connect to switch ${ip}`, error, 'E')
	})
}


/* Web Logging Functions */


async function logTemp() {
	let Frames = frames()
	log('Getting temperatures', 'A')

	let promises = []

	for (let index = 0; index < Frames.length; index++) {
		const frame = Frames[index]
		promises.push(axios.get('http://'+frame.IP, { timeout: 1000 }))
	}

	const results = await Promise.allSettled(promises)
	log('Got temperature data, processing', 'D')
	let tempSum = 0
	let tempValid = 0

	for (let index = 0; index < Frames.length; index++) {
		const frameData = results[index]
		if (frameData.status == 'fulfilled') {
			let temp = 0
			const frameStatData = frameData.value.data.split('<p><b>Temperature In:</b></p>')
			if (typeof frameStatData[1] == 'undefined') return
			const frameStat = frameStatData[1].slice(25,27)
			if (frameStat == 'OK') {
				let unfilteredTemp = frameData.value.data.split('<p><b>Temperature In:</b></p>')[1].slice(29,33)
				temp = parseInt(unfilteredTemp.substring(0, unfilteredTemp.indexOf(')')))
			} else {
				log(`${Frames[index].Name} frame temperature is not OK`, 'W')
			}
			Frames[index].Temp = temp
			tempSum += temp
			tempValid++
			log(`${Frames[index].Name} temperature = ${temp} deg C`, 'D')
			if (config.get('localDataBase')) db.insert('temperature', {
				'frame': Frames[index].Name,
				'temperature': Frames[index].Temp,
				'system': config.get('systemName')
			})
		} else {
			log(`Can't connect to frame: '${Frames[index].Name}'`, 'W')
		}
	}

	let tempAvg

	if (tempValid == 0) {
		log('Invalid temperature measured connections must have failed', 'E')
		sendSms('CANNOT CONNECT TO MCR, MAYBE IT HAS MELTED?')

	} else {
		tempAvg = tempSum / tempValid
		log(`Average temperature = ${tempAvg} deg C`, 'D')
		log(`Warning temperature = ${config.get('warningTemperature')} deg C`, 'D')

		if (tempAvg > config.get('warningTemperature')) {
			log('Warning: Temperature over warning limit, sending SMS', 'W')
			sendSms(`Commitment to environment sustainability failed, MCR IS MELTING: ${tempAvg} deg C`)
		}
		if (config.get('webEnabled')) sendData({'command':'log', 'type':'temperature', 'data':Frames})
	}

}

function webLogPing() {
	sendData({'command':'log', 'type':'ping'})
}

function webLogBoot() {
	sendData({'command':'log', 'type':'boot'})
}

function sendSms(msg) {
	if (!config.get('textsEnabled')) return

	let params = {
		Message: msg,
		TopicArn: 'arn:aws:sns:eu-west-2:796884558775:TDS_temperature'
	}

	let promise = new AWS.SNS({ apiVersion: '2010-03-31' }).publish(params).promise()
	promise.then(function (data) {
		log(`Text message sent - messageId: ${data.MessageId}`)
	}).catch(function (err) {
		console.error(err, err.stack)
	})
}

function connectToWebServer(retry = false) {
	if(!config.get('webEnabled')) return
	let webSocket

	if ((!webServer.connected && webServer.active && webServer.attempts < 3) || (retry && !webServer.connected)) {
		let inError = false
		if (retry) {
			log(`Retrying connection to dead server: ${logs.r}wss://${webServer.address}${logs.reset}`, 'W')
		}
		webSocket = new WebSocket('wss://'+webServer.address)

		webServer.socket = webSocket

		webSocket.on('open', function open() {
			let payload = {}
			payload.command = 'register'
			payload.name = config.get('systemName')
			sendData(payload)

			log(`${logs.g}${webServer.address}${logs.reset} Established a connection to webserver`, 'S')
			webServer.connected = true
			webServer.active = true
			webServer.attempts = 0
		})

		webSocket.on('message', function message(msgJSON) {
			try {
				const msgObj = JSON.parse(msgJSON)
				if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
					logObj('Received from other server', msgObj, 'A')
				} else if (config.get('printPings') == true) {
					logObj('Received from other server', msgObj, 'A')
				}
				switch (msgObj.payload.command) {
				case 'ping':
					sendData({
						'command': 'pong'
					})
					break
				case 'data':
					log('Recieved temp/ping data from server', 'D')
					break
				default:
					logObj('Received unknown from other server', msgObj, 'W')
				}
			} catch (e) {
				try {
					const msgObj = JSON.parse(msgJSON)
					if (msgObj.payload.command !== 'ping' && msgObj.payload.command !== 'pong') {
						logObj('Received from other server', msgObj, 'A')
					} else if (config.get('printPings') == true) {
						logObj('Received from other server', msgObj, 'A')
					}
					if (typeof msgObj.type == 'undefined') {
						let stack = e.stack.toString().split(/\r\n|\n/)
						stack = JSON.stringify(stack, null, 4)
						log(`Server error, stack trace: ${stack}`, 'E')
					} else {
						log('A device is using old \'chiltv\' data format, upgrade it to v4.0 or above', 'E')
					}
				} catch (e2) {
					log('Invalid JSON from other server- '+e, 'E')
					logObj('Received from other server', JSON.parse(msgJSON), 'A')
				}
			}
		})

		webSocket.on('close', function close() {
			webServer.connected = false
			webServer.socket = null
			webServer.attempts++
			if (!inError) {
				log(`${logs.r}${webServer.address}${logs.reset} Outbound webserver connection closed`, 'W')
			}
		})

		webSocket.on('error', function error() {
			inError = true
			log(`Could not connect to server: ${logs.r}${webServer.address}${logs.reset}`, 'E')
		})
	} else if (!webServer.connected && webServer.active) {
		webServer.active = false
		log(`Server not responding, changing status to dead: ${logs.r}${webServer.address}${logs.reset}`, 'E')
	}
}

function sendData(payload) {
	let packet = {}
	let header = makeHeader()
	packet.header = header
	packet.payload = payload
	if (webServer.connected) {
		webServer.socket.send(JSON.stringify(packet))
	}
}


/* Database */


class database {
	constructor() {
		this.pool = mariadb.createPool({
			host: config.get('dbHost'),
			user: config.get('dbUser'),
			password: config.get('dbPass'),
			connectionLimit: 5
		})
	}

	async init() {
		log('Initialising SQL database', 'S')
		await this.query(`CREATE DATABASE IF NOT EXISTS ${config.get('dbName')};`)
		this.pool = mariadb.createPool({
			host: config.get('dbHost'),
			user: config.get('dbUser'),
			password: config.get('dbPass'),
			database: config.get('dbName'),
			connectionLimit: 5
		})
		await this.#tableCheck('temperature', `CREATE TABLE \`temperature\` (
			\`PK\` int(11) NOT NULL,
			\`frame\` text NOT NULL,
			\`temperature\` float NOT NULL,
			\`system\` text NOT NULL,
			\`time\` timestamp NOT NULL DEFAULT current_timestamp(),
			PRIMARY KEY (\`PK\`)
		)`, 'PK')
		log('Tables initialised', 'S')
	}

	async #tableCheck(table, tableDef, pk) {
		const rows = await this.query(`SELECT count(*) as count
			FROM information_schema.TABLES
			WHERE (TABLE_SCHEMA = '${config.get('dbName')}') AND (TABLE_NAME = '${table}')
		`)
		if (rows[0].count == 0) {
			log(`Table: ${table} is being created`, 'S')
			await this.query(tableDef)
			await this.query(`ALTER TABLE \`${table}\` MODIFY \`${pk}\` int(11) NOT NULL AUTO_INCREMENT;`)
		}
	}

	async get(table, _conditions) {
		const where = typeof _conditions == 'string' ? _conditions : _conditions.join(' and ')
		const query = `SELECT * FROM ${table} WHERE ${where}`
		const result = await this.query(query)
		return result
	}

	async insert(table, _values) { // { affectedRows: 1, insertId: 1, warningStatus: 0 }
		const query = `INSERT INTO ${table}(${Object.keys(_values).join(',')}) values ('${Object.values(_values).join('\',\'')}')`
		const result = await this.query(query)
		return result
	}

	async update(table, _values, _conditions) {
		let where = ''
		switch (typeof _conditions) {
		case 'undefined':
			where = ''
			break
		case 'string':
			where = 'WHERE '+_conditions
			break
		case 'object':
			where = 'WHERE '+_conditions.join(' and ')
			break
		default:
			break
		}
		const values = Object.keys(_values).map(key => `${key} = ${_values[key]}`).join(',')
		const query = `UPDATE ${table} SET ${values} ${where}`
		const result = await this.query(query)
		return result
	}

	async query(query) {
		try {
			const conn = await this.pool.getConnection()
			const rows = await conn.query(query)
			conn.end()
			return rows
		} catch (error) {
			logs.error('SQL Error', error)
		}
	}

}

const db = setupDatabase()

function setupDatabase() {
	if (!config.get('localDataBase')) return
	const db = new database
	db.init()
	return db
}



/* Utility Functions */


function parseTempalteString(string) {

	function paternDecompose(patern) {
		const paternArray = patern.split(',')
		const outputArray = []
		for (let index = 0; index < paternArray.length; index++) {
			const element = paternArray[index]
			if (element.includes('-')) {
				const [from, to] = element.split('-')
				for (let index = from; index <= to; index++) {
					outputArray.push(index)
				}
			} else {
				outputArray.push(element)
			}
		}
		return outputArray.sort((a,b)=>a[1]-b[1])
	}

	string = `#${string}#`
	const loopable = string.split(/{(.*?)}/g)
	let returnArray = [loopable.shift().substring(1)]
	const loopLength = loopable.length
	if (loopLength == 0) {
		returnArray[0] = returnArray[0].slice(0, -1)
	}
	for (let index = 0; index < loopLength; index++) {
		const text = (index == loopLength - 2) ? loopable[index + 1].slice(0, -1) : loopable[index + 1]
		const paternArray = paternDecompose(loopable[index])

		const newReturnArray = []
		returnArray.forEach(existingElement => {
			paternArray.forEach(paternElement => {
				newReturnArray.push(existingElement+paternElement+text)
			})
		})
		returnArray = newReturnArray
		index++
	}
	return returnArray
}

function getDescription(deviceName) {
	if (typeof deviceName !== 'undefined') {
		const map = devices().reduce((obj, item) => Object.assign(obj, { [item.name]: item.description }), {})
		let trimmedDeviceName = deviceName.slice(0, deviceName.lastIndexOf('_') + 1)
		return map[trimmedDeviceName]
	} else {
		return undefined
	}
}

function minutes(n) {
	return parseInt(n) * 60
}

function clearEmpties(o) {
	for (let k in o) {
		if (!o[k] || typeof o[k] !== 'object') {
			continue // If null or not an object, skip to the next iteration
		}

		// The property is an object
		clearEmpties(o[k]) // <-- Make a recursive call on the nested object
		if (Object.keys(o[k]).length === 0) {
			delete o[k] // The object had no properties, so delete that property
		}
	}
	return o
}

async function startLoopAfterDelay(callback, seconds) {
	setInterval(callback, seconds * 1000)
	callback()
	log('Starting '+callback.name, 'A')
	await sleep(1)
}

async function sleep(seconds) {
	await new Promise ((resolve)=>{setTimeout(resolve, 1000*seconds)})
}


/* Loops */


function startLoops() {
	connectToWebServer(true)

	// 5 Second ping loop
	setInterval(() => {
		connectToWebServer()
		doPing()
	}, 5*1000)

	// 1 Minute ping loop
	setInterval(() => {
		connectToWebServer(true)
	}, 60*1000)
}


/* Start Functions */


if (config.get('webEnabled')) {
	startLoops()
	webLogBoot()
	await startLoopAfterDelay(webLogPing, pingFrequency)
}
if (!config.get('devMode')) {
	await startLoopAfterDelay(lldpLoop, lldpFrequency)
	await startLoopAfterDelay(checkDevices, devicesFrequency)
	await startLoopAfterDelay(switchMac, switchStatsFrequency)
	await startLoopAfterDelay(switchPhy, switchStatsFrequency)
	await startLoopAfterDelay(switchFibre, switchStatsFrequency)
	await startLoopAfterDelay(checkUps, upsFrequency)
	await startLoopAfterDelay(logTemp, tempFrequency)
}
