/* eslint-disable no-undef */
let server = window.location.origin + "/";

let editors = {};

let pingChart;
let tempChart;
let bootChart;
let syslogHistogram;
let pings = {};
let boots = {};

const templates = {};

templates.nameIP = `<% for(i = 0; i < devices.length; i++) { %>
  <tr data-index="<%=i%>" data-template="nameIP">
    <td data-type="text" data-key="Name" data-value="<%-devices[i].Name%>"><%-devices[i].Name%></td>
    <td data-type="text" data-key="IP" data-value="<%-devices[i].IP%>"><%-devices[i].IP%></td>
    <td>
      <button type="button" class="btn btn-danger editConfig w-50">Edit</button>
      <button type="button" class="btn btn-danger deleteRow w-50">Delete</button>
    </td>
  </tr>
<% } %>`;

templates.pings = `<% for(i = 0; i < devices.length; i++) { %>
	<tr data-index="<%=i%>" data-template="pings">
	  <td data-type="text" data-key="Name" data-value="<%-devices[i].Name%>"><%-devices[i].Name%></td>
	  <td data-type="text" data-key="IP" data-value="<%-devices[i].IP%>"><%-devices[i].IP%></td>
	  <td data-type="check" data-key="SSH" data-value="<%-devices[i].SSH%>" readonly></td>
	  <td data-type="check" data-key="HTTP" data-value="<%-devices[i].HTTP%>" readonly></td>
	  <td data-type="check" data-key="HTTPS" data-value="<%-devices[i].HTTPS%>" readonly></td>
	  <td>
		<button type="button" class="btn btn-danger editConfig w-50">Edit</button>
		<button type="button" class="btn btn-danger deleteRow w-50">Delete</button>
	  </td>
	</tr>
  <% } %>`;

templates.switch = `<% for(i = 0; i < devices.length; i++) { %>
  <tr data-index="<%=i%>" data-template="switch">
    <td data-type="text" data-key="Name" data-value="<%-devices[i].Name%>"><%-devices[i].Name%></td>
    <td data-type="text" data-key="IP" data-value="<%-devices[i].IP%>"><%-devices[i].IP%></td>
    <td data-type="text" data-key="User" data-value="<%-devices[i].User%>"><%-devices[i].User%></td>
    <td data-type="text" data-key="Pass" data-value="<%-devices[i].Pass%>"><%-devices[i].Pass%></td>
	<td data-type="select" data-key="Type" data-value="<%-devices[i].Type%>" data-options="Control,Media"><%-devices[i].Type%></td>
	<td data-type="select" data-key="OS" data-value="<%-devices[i].OS%>" data-options="EOS,NXOS,IOS"><%-devices[i].OS%></td>
    <td>
      <button type="button" class="btn btn-danger editConfig w-50">Edit</button>
      <button type="button" class="btn btn-danger deleteRow w-50">Delete</button>
    </td>
  </tr>
<% } %>`;

templates.devices = `<% for(i = 0; i < devices.length; i++) { %>
  <tr data-index="<%=i%>" data-template="devices">
    <td data-type="text" data-key="name" data-value="<%-devices[i].name%>"><%-devices[i].name%></td>
    <td data-type="text" data-key="description" data-value="<%-devices[i].description%>"><%-devices[i].description%></td>
    <td>
      <button type="button" class="btn btn-danger editConfig w-50">Edit</button>
      <button type="button" class="btn btn-danger deleteRow w-50">Delete</button>
    </td>
  </tr>
<% } %>`;

templates.ports = `<% for(i = 0; i < devices.length; i++) { %>
	<tr data-index="<%=i%>" data-template="ports">
		<td data-type="select" data-key="Switch" data-value="<%-devices[i].Switch%>" data-options="<%-switches.join(',')%>"><%-devices[i].Switch%></td>
		<td data-type="text" data-key="Port" data-value="<%-devices[i].Port%>"><%-devices[i].Port%></td>
	  	<td>
			<button type="button" class="btn btn-danger editConfig w-50">Edit</button>
			<button type="button" class="btn btn-danger deleteRow w-50">Delete</button>
	  	</td>
	</tr>
<% } %>`;


function socketDoOpen(socket) {
	console.log('Registering as client');
	socket.send({'command':'register'});
	let to = new Date().getTime()/1000;
	let from = to - 7200;
	socket.send({
		'command':'get',
		'data':'temperature',
		'from': from,
		'to': to
	});

	socket.send({
		'command':'get',
		'data':'ping',
		'from': from,
		'to': to
	});
}

function socketDoMessage(header, payload) {
	switch (payload.command) {
	case 'data':
		if (payload.system === currentSystem) {
			switch (payload.data) {
			case 'ping':
				if (payload.replace) {
					pingChart.data.datasets[0].data = payload.points;
				} else {
					const datePing = new Date(parseInt(payload.time));
					const colour = payload.status == 1 ? '128, 255, 128' : '255, 64, 64';
					pingChart.data.datasets[0].data[datePing] = payload.status;
					pingChart.data.datasets[0].backgroundColor[0] = `rgba(${colour}, 0.2)`;
					pingChart.data.datasets[0].borderColor[0] = `rgba(${colour}, 1)`;
				}
				$('#lastPing').attr('data-last-update', Date.now());
				pingChart.update();
				break;
			case 'boot':
				if (payload.replace) {
					bootChart.data.datasets[0].data = payload.points;
				} else {
					const dateBoot = new Date(parseInt(payload.time));
					bootChart.data.datasets[0].data[dateBoot] = 1;
				}
				$('#lastBoot').attr('data-last-update', Date.now());
				bootChart.update();
				break;
			case 'temps':
				if (payload.replace) {
					replaceTemps(payload.points);
				} else {
					addTemps(payload.points);
				}
				$('#lastHot').attr('data-last-update', Date.now());
				break;
			case 'syslog':
				handleSyslogMessage(payload);
				break;
			}
		}
		break;
	case 'log':
		switch (payload.type) {
		case 'ups':
			handleUPSData(payload.data);
			break;
		case 'fibre':
			handleFibreData(payload.data, 'Media');
			$('#lastTra').attr('data-last-update', Date.now());
			break;
		case 'fibre_control':
			handleFibreData(payload.data, 'Control');
			$('#lastTraCont').attr('data-last-update', Date.now());
			break;
		case 'devices':
			handleDevicesData(payload.data, 'Media');
			$('#lastAlive').attr('data-last-update', Date.now());
			break;
		case 'devices_control':
			handleDevicesData(payload.data, 'Control');
			$('#lastAliveCont').attr('data-last-update', Date.now());
			break;
		case 'mac':
			handleMacData(payload.data);
			break;
		case 'phy':
			handlePhyData(payload.data);
			break;
		case 'localPing':
			handleLocalPing(payload.data);
			break;
		case 'power':
			handleSwitchPower(payload.data, 'Media');
			$('#lastPower').attr('data-last-update', Date.now());
			break;
		case 'power_control':
			handleSwitchPower(payload.data, 'Control');
			$('#lastPowerCont').attr('data-last-update', Date.now());
			break;
		case 'temperature':
			handleSwitchTemperature(payload.data, 'Media');
			$('#lastTemperature').attr('data-last-update', Date.now());
			break;
		case 'temperature_control':
			handleSwitchTemperature(payload.data, 'Control');
			$('#lastTemperatureCont').attr('data-last-update', Date.now());
			break;
		case 'fans':
			handleDevicesFans(payload.data, 'Media');
			$('#lastFans').attr('data-last-update', Date.now());
			break;
		case 'fans_control':
			handleDevicesFans(payload.data, 'Control');
			$('#lastFansCont').attr('data-last-update', Date.now());
			break;
		case 'interfaces':
			handleInterfaces(payload.data, 'Media');
			$('#lastInterfaces').attr('data-last-update', Date.now());
			break;
		case 'interfaces_control':
			handleInterfaces(payload.data, 'Control');
			$('#lastInterfacesCont').attr('data-last-update', Date.now());
			break;
		default:
			break;
		}
		break;
	default:

	}
}

function syslogFormat(message) {
	let formatted = message.replace(/down/g, '<span class="text-danger">down</span>');
	formatted = formatted.replace(/Link failure/g, '<span class="text-danger">Link failure</span>');
	formatted = formatted.replace(/none/g, '<span class="text-warning">none</span>');
	formatted = formatted.replace(/changed/g, '<span class="text-warning">changed</span>');
	formatted = formatted.replace(/ up/g, '<span class="text-success"> up</span>');
	formatted = formatted.replace(/consistent/g, '<span class="text-success">consistent</span>');

	formatted = formatted.replace(/Ethernet(.*?)\/([0-9]{1,3})\/([0-9]{1,3})/g, '<span class="text-info">Ethernet$1/$2/$3</span>');
	formatted = formatted.replace(/Ethernet(.*?)\/([0-9]{1,3})/g, '<span class="text-info">Ethernet$1/$2</span>');
	formatted = formatted.replace(/vPC ([0-9]{1,3})/g, '<span class="text-info">vPC $1</span>');
	formatted = formatted.replace(/port-channel([0-9]{1,3})/g, '<span class="text-info">port-channel$1</span>');
	return formatted
}

function handleSyslogMessage(payload) {
	$('#lastSyslog').attr('data-last-update', Date.now());
	const $tbody = $('table[data-catagory="syslog"] tbody');
	const type = $('table[data-catagory="syslog"]').attr('data-mode');
	const ips = $('#syslogSelect').val();
	if (payload.replace) $tbody.empty();
	if (type === 'duration' && !payload.replace) return;
	if (type === 'live' && payload.replace) return;
	try {
		const points = {};

		let rangeTime;
		let firstTime;
		let lastTime;
		let fullRangeTime;
		if (payload.replace) {
			firstTime = new Date(payload.logs.at(1).time);
			lastTime = new Date(payload.logs.at(-1).time);
			fullRangeTime = lastTime - firstTime;
			rangeTime = fullRangeTime/75;
		}

		payload.logs.forEach(log => {
			if (!(ips.includes(log.ip) || ips.includes('all'))) return;
			const maxLogs = 499;
			const dateTime = new Date(log.time)
			const message = syslogFormat(log.message);
			const name = syslogSourceList[log.ip] || log.ip;
			const $liveLogs = $('.logType_live');
			if ($liveLogs.length > maxLogs) {
				for (let index = maxLogs; index < $liveLogs.length; index++) {
					console.log(index);
					const log = $liveLogs[index];
					log.remove();
				}
			}
			$tbody.prepend(`<tr class="logType_${type}">
				<td>${message}</td>
				<td class="text-nowrap">${name}</td>
				<td class="text-nowrap">${dateTime.toLocaleString()}</td>
			</tr>`);
			if (payload.replace) {
				const interval = Math.floor((dateTime - firstTime)/rangeTime);
				const intervalIdentifier = new Date(interval*rangeTime + firstTime.getTime());
				if (points[intervalIdentifier] == undefined) {
					points[intervalIdentifier] = 1;
				} else {
					points[intervalIdentifier]++;
				}
			}
		});
		if (payload.replace) {
			syslogHistogram.data.datasets[0].data = points;
			syslogHistogram.update();
		}
	} catch (error) {
		$tbody.prepend('<tr><td colspan="3">No Logs Found</td></tr>');
		console.error(error);
	}
}

function addTemps(points) {
	for (var timeStamp in points) {
		let sets = tempChart.data.datasets.map((set)=>{return set.label;});
		let dateStamp = new Date(parseInt(timeStamp));
		let point = points[timeStamp];
		for (var frame in point) {
			if (!sets.includes(frame)) {
				let data = {};
				data[dateStamp] = point[frame];
				newTempDataSet(frame, data);
			} else {
				tempChart.data.datasets[sets.indexOf(frame)].data[dateStamp] = point[frame];
			}
		}
	}
	tempChart.update();
}

function replaceTemps(points) {
	tempChart.data.datasets = [];
	for (var timeStamp in points) {
		let sets = tempChart.data.datasets.map((set)=>{return set.label;});
		let dateStamp = new Date(parseInt(timeStamp));
		let point = points[timeStamp];
		for (var frame in point) {
			if (!sets.includes(frame)) {
				let data = {};
				data[dateStamp] = point[frame];
				newTempDataSet(frame, data);
			} else {
				tempChart.data.datasets[sets.indexOf(frame)].data[dateStamp] = point[frame];
			}
		}
	}
	tempChart.update();
}

function rand() {
	return Math.floor((Math.random() * 155)+100);
}

function newTempDataSet(name, data) {
	let r = rand();
	let g = rand();
	let b = rand();
	let dataset = {
		label: name,
		data: data,
		backgroundColor: [
			`rgba(${r}, ${g}, ${b}, 0.2)`
		],
		borderColor: [
			`rgba(${r}, ${g}, ${b}, 1)`
		],
		cubicInterpolationMode: 'monotone',
		tension: 0.4
	};
	tempChart.data.datasets.push(dataset);
	tempChart.update();
}

function renderTempChart() {
	const ctx = $('#tempChart');
	const data = {
		datasets: []
	};
	const config = {
		type: 'line',
		data: data,
		options: {
			responsive: true,
			interaction: {
				mode: 'index',
				intersect: false,
			},
			stacked: false,
			scales: {
				x: {
					type: 'time',
					time: {
						displayFormats: {
							second: 'YY/MM/DD H:mm:ss',
							minute: 'YY/MM/DD H:mm',
							hour: 'YY/MM/DD H:mm'
						}
					}
				}
			}
		},
	};
	tempChart = new Chart(ctx, config);
}

function renderPingChart() {
	const ctx = $('#pingChart');
	const data = {
		datasets: [
			{
				label: 'Network Status',
				data: [],
				backgroundColor: [
					'rgba(128, 255, 128, 0.2)'
				],
				borderColor: [
					'rgba(128, 255, 128, 1)'
				]
			}
		]
	};
	const config = {
		type: 'line',
		data: data,
		options: {
			responsive: true,
			interaction: {
				mode: 'index',
				intersect: false,
			},
			stacked: false,
			scales: {
				x: {
					type: 'time',
					time: {
						displayFormats: {
							second: 'YY/MM/DD H:mm:ss',
							minute: 'YY/MM/DD H:mm',
							hour: 'YY/MM/DD H:mm'
						}
					}
				}
			}
		},
	};
	pingChart = new Chart(ctx, config);
}

function renderBootChart(boots) {
	const ctx = $('#bootChart');
	const data = {
		datasets: [
			{
				label: 'Argos Starts',
				data: boots,
				backgroundColor: [
					'rgba(128, 255, 128, 0.2)'
				],
				borderColor: [
					'rgba(128, 255, 128, 1)'
				],
				cubicInterpolationMode: 'monotone',
				tension: 0.4
			}
		]
	};
	const config = {
		type: 'line',
		data: data,
		options: {
			responsive: true,
			interaction: {
				mode: 'index',
				intersect: false,
			},
			stacked: false,
			scales: {
				x: {
					type: 'time',
					time: {
						displayFormats: {
							second: 'YY/MM/DD H:mm:ss',
							minute: 'YY/MM/DD H:mm',
							hour: 'YY/MM/DD H:mm'
						}
					}
				}
			}
		},
	};
	bootChart = new Chart(ctx, config);

}

function renderSyslogChart() {
	const ctx = $('#syslogHistogram');
	const data = {
		datasets: [
			{
				label: 'Logs Frequency',
				data: [],
				backgroundColor: [
					'rgba(128, 255, 128, 0.6)'
				],
				borderColor: [
					'rgba(128, 255, 128, 1)'
				],
				cubicInterpolationMode: 'monotone',
				tension: 0.4
			}
		]
	};
	const config = {
		type: 'bar',
		data: data,
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: {
				mode: 'index',
				intersect: false,
			},
			stacked: false,
			scales: {
				x: {
					type: 'time',
					time: {
						displayFormats: {
							second: 'YY/MM/DD H:mm:ss',
							minute: 'YY/MM/DD H:mm',
							hour: 'YY/MM/DD H:mm'
						}
					}
				}
			}
		},
	};
	syslogHistogram = new Chart(ctx, config);
}

/* Device data handeling */

function handleFibreData(data, type) {
	const table = `[data-type="${type}"] table[data-catagory="fibre"]`;
	$(`${table} tbody`).empty();
	if (Object.keys(data).length == 0) {
		$(`[data-type="${type}"][data-type="fibre"]`).addClass('text-muted');
		$(table).addClass('text-muted');
	}
	else {
		$(`[data-type="${type}"][data-type="fibre"]`).removeClass('text-muted');
		$(table).removeClass('text-muted');
		$.each(data, (k, device) => {
			const lldp = device.lldp ? device.lldp : '<em class="text-muted">n/a</em>';
			let feeding;
			if (typeof device.description !== 'undefined') {
				feeding = device.description;
			} else {
				feeding = '<em class="text-muted">n/a</em>';
			}
			const row = `<tr>
				<td>${device.switch}</td>
				<td>${device.port}</td>
				<td>${lldp}</td>
				<td>${feeding}</td>
				<td>${device.rxPower} dBm</td>
			</tr>`;
			$(`${table} tbody`).append(row);
		});
	}
}

function handleDevicesData(data, type) {
	const table = `[data-type="${type}"] table[data-catagory="alive"]`;
	$(`${table} tbody`).empty();
	if (Object.keys(data).length == 0) {
		$(`[data-type="${type}"][data-type="alive"]`).addClass('text-muted');
		$(table).addClass('text-muted');
	} else {
		$(`[data-type="${type}"][data-type="alive"]`).removeClass('text-muted');
		$(table).removeClass('text-muted');
		$.each(data, (port, lldp) => {
			let row = '<tr><td>' + port + '</td>';
			switch (type) {
				case 'Control':
					for (let index = 0; index < ControlSwitches.length; index++) {
						if (lldp.includes(ControlSwitches[index])) {
							row += '<td class=\'bg-danger\'>Down</td>';
						} else {
							row += '<td class=\'bg-success\'>Up</td>';
						}
					}
					break;
				case 'Media':
					for (let index = 0; index < Switches.length; index++) {
						if (lldp.includes(Switches[index])) {
							row += '<td class=\'bg-danger\'>Down</td>';
						} else {
							row += '<td class=\'bg-success\'>Up</td>';
						}
					}
					break;
				default:
					break;
			}
			$(`${table} tbody`).append(row);
		});
	}
}

function handleMacData(data) {
	$('table#mac tbody').empty();
	if (Object.keys(data).length == 0) {
		$('div#col-mac').addClass('text-muted');
		$('table#mac').addClass('text-muted');
	}
	else {
		$('div#col-mac').removeClass('text-muted');
		$('table#mac').removeClass('text-muted');
		$.each(data, (k, v) => {
			let lldp = v.lldp ? v.lldp : '<em class="text-muted">n/a</em>';
			let feeding;
			if (typeof v.description !== 'undefined') {
				feeding = v.description;
			} else {
				feeding = '<em class="text-muted">n/a</em>';
			}
			let s = `<tr><td>${v.switch}</td><td>${v.port}</td><td>${lldp}</td><td>${feeding}</td><td>${v.mac.phyState}</td><td>${v.mac.lastChange}</td></tr>`;
			$('table#mac tbody').append(s);
		});
	}
	$('#lastMac').attr('data-last-update', Date.now());
}

function handlePhyData(data) {
	$('table#phy tbody').empty();
	if (Object.keys(data).length == 0) {
		$('div#col-phy').addClass('text-muted');
		$('table#phy').addClass('text-muted');
	}
	else {
		$('div#col-phy').removeClass('text-muted');
		$('table#phy').removeClass('text-muted');
		$.each(data, (k, v) => {
			let lldp = v.lldp ? v.lldp : '<em class="text-muted">n/a</em>';
			let feeding;
			if (typeof v.description !== 'undefined') {
				feeding = v.description;
			} else {
				feeding = '<em class="text-muted">n/a</em>';
			}
			const time = new Date(v.phy.lastChange * 1000);
			let s = `<tr><td>${v.switch}</td><td>${v.port}</td><td>${lldp}</td><td>${feeding}</td><td>${v.phy.changes}</td><td>${time.toLocaleTimeString('en-GB')}</td></tr>`;
			$('table#phy tbody').append(s);
		});
	}
	$('#lastPhy').attr('data-last-update', Date.now());
}

function handleUPSData(data) {
	/*let hash = CryptoJS.MD5(JSON.stringify(data)).toString();
	if (lastUpsHash !== '' && hash !== lastUpsHash) {
		if (Object.keys(data).length > 0) {
			//saySomething("you pee ess broken")
		}
	} else if (lastUpsHash === '' && data.length > 0) {
		//saySomething("you pee ess broken")
	}
	lastUpsHash = hash;*/

	$('table#ups tbody').empty();
	if (Object.keys(data).length == 0) {
		$('div#col-ups').addClass('text-muted');
		$('table#ups').addClass('text-muted');
	}
	else {
		$('div#col-ups').removeClass('text-muted');
		$('table#ups').removeClass('text-muted');
		$.each(data, (k, v) => {
			let s;
			if (v.Status === 'Offline') {
				s = `<tr><td>${v.Name}</td><td colspan="4" class="text-center">Offline</td></tr>`;
			} else {
				s = `<tr><td>${v.Name}</td><td>${v.voltageIn}V ${v.freqIn}Hz</td><td>${v.voltageOut}V ${v.freqOut}Hz</td><td>${v.autonomy} min</td><td>${v.load}%</td></tr>`;
			}
			$('table#ups tbody').append(s);
		});
	}
	$('#lastUps').attr('data-last-update', Date.now());
}

function handleLocalPing(data) {
	const IP = data.IP;
	const Name = data.Name;
	const status = data.status;
	const $upTab = $('#pingLocalUp');
	const $downTab = $('#pingLocalDown');
	const $search = $(`.pingStatus[data-ip="${IP}"]`);
	let actions = '';
	if (data.SSH) actions += `<a type="button" class="btn me-1 btn-secondary btn-sm" href="ssh://${IP}" target="_blank">SSH</a>`;
	if (data.HTTP) actions += `<a type="button" class="btn me-1 btn-secondary btn-sm" href="http://${IP}" target="_blank">HTTP</a>`;
	if (data.HTTPS) actions += `<a type="button" class="btn me-1 btn-secondary btn-sm" href="https://${IP}" target="_blank">HTTPS</a>`;
	actions += '<button type="button" class="btn btn-close btn-close-white btn-sm float-end m-1 clearPing"></button>';
	if ($search.length < 1) {
		const $row = $(`<tr class="pingStatus" data-ip="${IP}" data-updated-time="${Date.now()}">
			<td>${Name}</td>
			<td>${IP}</td>
			<td data-last-update="${Date.now()}"></td>
			<td>${actions}</td>
		</tr>`);
		if (status) {
			$upTab.append($row);
		} else {
			$downTab.append($row);
		}
	} else {
		const $table = $search.closest('.table');
		if (($table.is('#pingLocalDown') && status) && true) {
			$upTab.append($search);
		} else if (($table.is('#pingLocalUp') && !status) && true) {
			$downTab.append($search);
		}
	}
	doTableSort($upTab.find('.sorted'), false);
	doTableSort($downTab.find('.sorted'), false);

	if (status) {
		$('#lastLocalPingUp').attr('data-last-update', Date.now());
	} else {
		$('#lastLocalPingDown').attr('data-last-update', Date.now());
	}
}

function handleSwitchPower(data, type) {
	const table = `[data-type="${type}"] table[data-catagory="power"]`;
	$(`${table} tbody`).empty();
	if (Object.keys(data).length == 0) {
		$(`[data-type="${type}"][data-type="power"]`).addClass('text-muted');
		$(table).addClass('text-muted');
	} else {
		$(`[data-type="${type}"][data-type="power"]`).removeClass('text-muted');
		$(table).removeClass('text-muted');

		$.each(data, (switchName, PSUs) => {
			for (const PSUIndex in PSUs) {
				if (Object.hasOwnProperty.call(PSUs, PSUIndex)) {
					const PSU = PSUs[PSUIndex];
					const timeOffset = new Date();
					let seconds = Math.floor(timeOffset/1000 - PSU.uptime);
					let minutes = Math.floor(seconds/60);
					let hours = Math.floor(minutes/60);
					const days = Math.floor(hours/24);
					hours = hours-(days*24);
					minutes = minutes-(days*24*60)-(hours*60);
					seconds = seconds-(days*24*60*60)-(hours*60*60)-(minutes*60);

					let time = "";

					if (days > 0) time += ` ${days} days`
					if (hours > 0) time += ` ${hours}h`
					if (minutes > 0) time += ` ${minutes}m`
					if (seconds > 0) time += ` ${seconds}s`

					$(`${table} tbody`).append(`<tr>
						<td>${switchName}</td>
						<td>${PSU.outputPower} Watts</td>
						<td>${time}</td>
						<td class="text-center ${PSU.inAlert ? "bg-success" : "bg-danger"}">${PSU.inAlert ? "Good" : "Error"}</td>
					</tr>`);
				}
			}
		});
	}
}

function handleSwitchTemperature(data, type) {
	const table = `[data-type="${type}"] table[data-catagory="temperature"]`;
	$(`${table} tbody`).empty();
	if (Object.keys(data).length == 0) {
		$(`[data-type="${type}"][data-type="temperature"]`).addClass('text-muted');
		$(table).addClass('text-muted');
	} else {
		$(`[data-type="${type}"][data-type="temperature"]`).removeClass('text-muted');
		$(table).removeClass('text-muted');
		$.each(data, (switchName, temperatures) => {
			for (const moduleName in temperatures) {
				const temperature = temperatures[moduleName];
				$(`${table} tbody`).append(`<tr>
					<td>${switchName}</td>
					<td>${moduleName}</td>
					<td>${Math.floor(temperature.temp)} °C</td>
					<td class="text-center ${temperature.inAlert ? "bg-success" : "bg-danger"}">${temperature.inAlert ? "Good" : "Error"}</td>
				</tr>`);
			}
		});
	}
	lastSwitchTemperature = Date.now();
}

function handleDevicesFans(data, type) {
	const table = `[data-type="${type}"] table[data-catagory="fans"]`;
	$(`${table} tbody`).empty();
	if (Object.keys(data).length == 0) {
		$(`[data-type="${type}"][data-type="fans"]`).addClass('text-muted');
		$(table).addClass('text-muted');
	} else {
		$(`[data-type="${type}"][data-type="fans"]`).removeClass('text-muted');
		$(table).removeClass('text-muted');
		$.each(data, (switchName, fans) => {
			for (const moduleName in fans) {
				const fan = fans[moduleName];
				$(`${table} tbody`).append(`<tr>
					<td>${switchName}</td>
					<td>${moduleName}</td>
					<td>${Math.floor(fan.speed)}%</td>
					<td class="text-center ${fan.inAlert ? "bg-success" : "bg-danger"}">${fan.inAlert ? "Good" : "Error"}</td>
				</tr>`);
			}
		});
	}
	lastSwitchTemperature = Date.now();
}

function handleInterfaces(data, type) {
	if (data == undefined) return;
	const table = `[data-type="${type}"] table[data-catagory="interfaces"]`;
	$(`${table} tbody`).empty();
	if (Object.keys(data).length == 0) {
		$(`[data-type="${type}"][data-type="interfaces"]`).addClass('text-muted');
		$(table).addClass('text-muted');
	} else {
		$(`[data-type="${type}"][data-type="interfaces"]`).removeClass('text-muted');
		$(table).removeClass('text-muted');
		for (const Switch in data) {
			for (const Port in data[Switch]) {
				const portInfo = data[Switch][Port];

				let time = "";

				if (Number(portInfo.lastFlap)) {
					const timeOffset = new Date();
					let seconds = Math.floor(timeOffset/1000 - portInfo.lastFlap);
					let minutes = Math.floor(seconds/60);
					let hours = Math.floor(minutes/60);
					const days = Math.floor(hours/24);
					hours = hours-(days*24);
					minutes = minutes-(days*24*60)-(hours*60);
					seconds = seconds-(days*24*60*60)-(hours*60*60)-(minutes*60);
					if (days > 0) time += ` ${days} days`;
					if (hours > 0) time += ` ${hours}:${minutes}:${seconds}`;
				} else {
					time = portInfo.lastFlap;
				}

				const inErrors = portInfo.inErrors > 0 ? `<div>Input Errors: ${portInfo.inErrors}</div>` : '';
				const outErrors = portInfo.outErrors > 0 ? `<div>Output Errors: ${portInfo.outErrors}</div>` : '';
				const inDiscards = portInfo.inDiscards > 0 ? `<div>Input Discards: ${portInfo.inDiscards}</div>` : '';
				const outDiscards = portInfo.outDiscards > 0 ? `<div>Output Discards: ${portInfo.outDiscards}</div>` : '';
				const outPercent = Math.round(100*portInfo.outRate/portInfo.maxRate);
				const outGbps = Math.round(portInfo.outRate/1000000000);
				const inPercent = Math.round(100*portInfo.inRate/portInfo.maxRate);
				const inGbps = Math.round(portInfo.inRate/1000000000);
				const outColour = `hsl(${130 - outPercent*1.3}deg 100% 30.36%)`;
				const inColour = `hsl(${120 - inPercent*1.3}deg 100% 30.36%)`;

				$(`${table} tbody`).append(`<tr>
					<td class="text-center ${portInfo.connected ? "bg-success" : "bg-danger"}">
						<div>${Switch} - ${portInfo.connected ? "UP" : "Down"}</div>
						<div>${Port}</div>
						<div>${portInfo.description}</div>
					</td>
					<td>
						<div>Port Flaps: ${portInfo.flapCount}</div>
						<div>Last Flap: ${time}</div>
						${inErrors}
						${outErrors}
						${inDiscards}
						${outDiscards}
					</td>
					<td>
						<div class="d-flex">
							<div>
								<div>Out: ${outPercent}% - ${outGbps}Gbps</div>
								<div>In: ${inPercent}% - ${inGbps}Gbps</div>
							</div>
							<div class="pie text-right" style="--p:${outPercent};--b:10px;--c:${outColour};--pi:${inPercent};--ci:${inColour}"></div>
						</div>
					</td>
				</tr>`);
			}
		}
	}
	lastSwitchTemperature = Date.now();
}

function updateLast() {
	$('[data-last-update]').each(function(i, element) {
		const $element = $(element);
		$element.text(prettifyTime($element.attr('data-last-update')));
	})
}

function prettifyTime(time) {
	if (time == -1) {
		return 'never';
	}
	let t = Math.floor((Date.now() - time) / 1000);
	let minutes = Math.floor(t / 60);
	let seconds = t % 60;
	if (minutes == 0 && seconds == 0) {
		return 'just now';
	} else if (minutes == 0) {
		if (seconds == 1) {
			return '1 second ago';
		} else {
			return seconds + ' seconds ago';
		}
	} else if (minutes == 1) {
		if (seconds == 0) {
			return '1 minute ago';
		}
		else if (seconds == 1) {
			return '1 minute, 1 second ago';
		} else {
			return '1 minute, ' + seconds + ' seconds ago';
		}
	} else {
		if (seconds == 0) {
			return minutes + ' minutes ago';
		}
		else if (seconds == 1) {
			return minutes + ' minutes, 1 second ago';
		} else {
			return minutes + ' minutes, ' + seconds + ' seconds ago';
		}
	}
}

function loading(state) {
	if (state) {
		$('#loading').removeClass('hidden');
	} else {
		$('#loading').addClass('hidden');
	}
}

function setupWebConnection() {
	if (!webEnabled) {
		$('#webBroken').html('<span class="p-2 badge badge-pill bg-secondary">Web Monitor Disabled</span>');
		return null;
	}

	renderPingChart();
	renderBootChart(boots);
	renderSyslogChart();

	$('#webBroken').html('<span class="p-2 badge badge-pill bg-danger">Web Monitor Offline</span>');
	const webConnection = new webSocket([webSocketEndpoint], 'Browser', version, currentSystem, secureWebsockets);
	webConnection.addEventListener('message', event => {
		const [header, payload] = event.detail;
		socketDoMessage(header, payload);
	});
	webConnection.addEventListener('open', () => {
		socketDoOpen(webConnection);
		$('#webBroken').html('<span class="p-2 badge badge-pill bg-success">Website Online</span>');
	});
	webConnection.addEventListener('close', () => {
		$('#webBroken').html('<span class="p-2 badge badge-pill bg-danger">Web Monitor Offline</span>');
	});
	return webConnection;
}

$(document).ready(function() {
	renderTempChart();
	setInterval(updateLast, 1000);

	const webConnection = setupWebConnection();

	$('#broken').html('<span class="badge badge-pill bg-danger">Argos Offline</span>');
	const localConnection = new webSocket([`${window.location.hostname}:${window.location.port}`], 'Browser', version, currentSystem);
	localConnection.addEventListener('message', event => {
		const [header, payload] = event.detail;
		socketDoMessage(header, payload);
	});
	localConnection.addEventListener('open', () => {
		socketDoOpen(localConnection);
		$('#broken').html('<span class="p-2 badge badge-pill bg-success">Argos Online</span>');
	});
	localConnection.addEventListener('close', () => {
		$('#broken').html('<span class="p-2 badge badge-pill bg-danger">Argos Offline</span>');
	});

	$('#tempFromPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'From'
	});
	$('#tempToPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'To'
	});
	$('#pingFromPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'From'
	});
	$('#pingToPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'To'
	});
	$('#bootFromPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'From'
	});
	$('#bootToPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'To'
	});
	$('#syslogFromPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'From'
	});
	$('#syslogToPick').dateTimePicker({
		dateFormat: 'YYYY-MM-DD HH:mm',
		title: 'To'
	});

	const syslogChoices = new Choices('#syslogSelect', {
		removeItems: true,
		removeItemButton: true,
		searchPlaceholderValue: "Select Devices",
	});

	$(document).click(function(e) {
		const $trg = $(e.target);
		if ($trg.hasClass('tempBut')) {
			let time = parseInt($trg.data('time'));
			let to = new Date().getTime()/1000;
			let from = to - time;
			localConnection.send({
				'command':'get',
				'data':'temperature',
				'from': from,
				'to': to
			});
		} else if ($trg.hasClass('pingBut')) {
			let time = parseInt($trg.data('time'));
			let to = new Date().getTime()/1000;
			let from = to - time;

			webConnection.send({
				'command':'get',
				'data':'ping',
				'from': from,
				'to': to
			});
		} else if ($trg.hasClass('bootBut')) {
			let time = parseInt($trg.data('time'));
			let to = new Date().getTime()/1000;
			let from = to - time;

			webConnection.send({
				'command':'get',
				'data':'boot',
				'from': from,
				'to': to
			});
		} else if ($trg.is('#toggleConfig') || $trg.is('#closeConfig')) {
			if ($('#config').hasClass('hidden')) {
				loading(true);
				Promise.allSettled([
					getConfig('switches'),
					getConfig('ports'),
					getConfig('devices'),
					getConfig('ups'),
					getConfig('frames'),
					getConfig('pings')
				]).then(values => {
					const [switches, ports, devices, ups, frames, pings] = values;
					loading(false);
					$('#config').removeClass('hidden');
					editors['switches'] = renderEditorTab(switches.value, editors['switches'], templates.switch, 'configSwitches');
					editors['ports'] = renderEditorTab(ports.value, editors['ports'], templates.ports, 'configPorts');
					editors['devices'] = renderEditorTab(devices.value, editors['devices'], templates.devices, 'configDevices');
					editors['ups'] = renderEditorTab(ups.value, editors['ups'], templates.nameIP, 'configUps');
					editors['frames'] = renderEditorTab(frames.value, editors['frames'], templates.nameIP, 'configFrames');
					editors['pings'] = renderEditorTab(pings.value, editors['pings'], templates.pings, 'configPings');
				}).catch(error => {
					console.error(error);
				});
			} else {
				$('#config').addClass('hidden');
			}
		} else if ($trg.hasClass('tableExport')) {
			const $active = $trg.closest('.alert.container').find('.tab-pane.active');
			const $table = $active.find('table');
			const editor = $table.data('editor');
			const editorJSON = editors[editor].get();
			let csv = Object.keys(editorJSON[0]).join(',') + '\n';
			for (let index = 0; index < editorJSON.length; index++) {
				csv += Object.values(editorJSON[index]).join(',') + '\n';
			}
			download(`${editor}.csv`,csv);
		} else if ($trg.hasClass('tableImport')) {
			const $active = $trg.closest('.alert.container').find('.tab-pane.active');
			const $table = $active.find('table.table');
			const $body = $table.find('tbody');
			const editor = $table.data('editor');
			const files = $('#csvUpload')[0].files;
			const reader = new FileReader();
			reader.onload = event => {
				const rows = event.target.result.split('\n');
				const headers = rows[0].split(',');
				const newEditor = []
				for (let index = 1; index < rows.length - 1; index++) {
					const row = rows[index].split(',');
					const item = {};
					for (let i = 0; i < headers.length; i++) {
						item[headers[i].replace('\r','')] = row[i].replace('\r','');
					}
					newEditor.push(item);
				}
				editors[editor].set(newEditor);
				editors[editor].expandAll();
				$body.html(ejs.render(templates[$body.data('template')], {devices: newEditor, switches: Switches.concat(ControlSwitches)}));
			};
			reader.readAsText(files[0]);
		} else if ($trg.hasClass('toggleTableRaw')) {
			const $active = $trg.closest('.alert.container').find('.tab-pane.active');
			$active.find('.dataTable').collapse('toggle');
			$active.find('.dataRaw').collapse('toggle');
		} else if ($trg.hasClass('editConfig')) {
			configRowEdit($trg);
		} else if ($trg.hasClass('doneConfig')) {
			configRowDone($trg);
		} else if ($trg.hasClass('tableNew')) {
			const $tbody = $trg.closest('.alert.container').find('.tab-pane.active').find('.dataTable').find('tbody');
			const $rows = $tbody.children();
			const index = $rows.length;
			const template = $tbody.data('template');
			const dummyData = [];
			dummyData[0] = {};
			switch (template) {
			case 'switch':
				dummyData[0].Name = 'Switch';
				dummyData[0].IP = 'IP Address';
				dummyData[0].User = 'Username';
				dummyData[0].Pass = 'Password';
				break;
			case 'nameIP':
				dummyData[0].Name = 'New Device';
				dummyData[0].IP = 'IP Address';
				break;
			case 'ports':
				dummyData[0].Switch = 'Switch';
				dummyData[0].Port = 'Port';
				break;
			case 'devices':
				dummyData[0].name = 'New Device';
				dummyData[0].description = 'Description';
				break;
			default:
				break;
			}
			const $new = $(ejs.render(templates[template], {'devices': dummyData, switches: Switches.concat(ControlSwitches)}));
			$new.attr('data-index', index);
			$tbody.append($new);
			$new.find('.editConfig').trigger('click');
		} else if ($trg.hasClass('tableSave')) {
			let promises = [];
			for (const editor in editors) {
				if (Object.hasOwnProperty.call(editors, editor)) {
					promises.push($.ajax(`${server}set${editor}`, {
						data : JSON.stringify(editors[editor].get()),
						contentType : 'application/json',
						type : 'POST'}
					));
				}
			}
			Promise.allSettled(promises).then(() => {
				alert('Saved');
			});
		} else if ($trg.hasClass('deleteRow')) {
			const $row = $trg.closest('tr');
			const $tbody = $trg.closest('tbody');
			const editor = $row.closest('table').data('editor');
			let current = editors[editor].get();
			current.splice($row.data('index'), 1);
			editors[editor].set(current);
			editors[editor].expandAll();
			$row.remove();
			
			$tbody.children().each(function(index) {
				$(this).attr('data-index', index);
			});
		} else if ($trg.is('#syslogHistogramToggle')) {
			const $cont = $('div[data-catagory="syslog"]');
			$cont.toggleClass('showHistogram');
		} else if ($trg.hasClass('sortable')) {
			doTableSort($trg, true);
		} else if ($trg.hasClass('navTab')) {
			const tab = $trg.attr('id').replace('nav-','').replace('-tab','');
			history.pushState({}, "", `#${tab}`);
		} else if ($trg.hasClass('clearPing')) {
			$trg.closest('tr').remove();
		}
	});

	$(document).change(function(e) {
		const $trg = $(e.target);
		if ($trg.is('#tempFrom') || $trg.is('#tempTo')) {
			localConnection.send({
				'command':'get',
				'data':'temperature',
				'from': parseInt($('#tempFrom').val()),
				'to': parseInt($('#tempTo').val())
			});
		} else if ($trg.is('#pingFrom') || $trg.is('#pingTo')) {
			webConnection.send({
				'command':'get',
				'data':'ping',
				'from': parseInt($('#pingFrom').val()),
				'to': parseInt($('#pingTo').val())
			});
		} else if ($trg.is('#bootFrom') || $trg.is('#bootTo')) {
			webConnection.send({
				'command':'get',
				'data':'boot',
				'from': parseInt($('#bootFrom').val()),
				'to': parseInt($('#bootTo').val())
			});
		} else if ($trg.is('#syslogFrom') || $trg.is('#syslogTo')) {
			$('#syslogDurationPreset').removeClass('active');
			localConnection.send({
				'command':'get',
				'data':'syslog',
				'from': parseInt($('#syslogFrom').val()),
				'to': parseInt($('#syslogTo').val()),
				'ips': $('#syslogSelect').val()
			})
		} else if ($trg.is('#syslogSelect')) {
			const $btn = $('#syslogDurationPreset.active');
			let to = parseInt($('#syslogTo').val());
			let from = parseInt($('#syslogFrom').val());
			if ($btn) {
				const value = $btn.val();
				to = new Date().getTime()/1000;
				if (value == "live") {
					from = to;
					$('table[data-catagory="syslog"]').attr('data-mode', 'live');
				} else {
					from = to - parseInt(value);;
					$('table[data-catagory="syslog"]').attr('data-mode', 'duration');
				}
			}
			localConnection.send({
				'command':'get',
				'data':'syslog',
				'from': from,
				'to': to,
				'ips': $('#syslogSelect').val()
			})
		} else if ($trg.is('#syslogDurationPreset')) {
			const value = $trg.val();
			let to = new Date().getTime()/1000;
			let from = to;
			if (value == "live") {
				$('table[data-catagory="syslog"]').attr('data-mode', 'live');
			} else {
				from = to - parseInt(value);
				$('table[data-catagory="syslog"]').attr('data-mode', 'duration');
			}

			$trg.addClass('active');
			localConnection.send({
				'command':'get',
				'data':'syslog',
				'from': from,
				'to': to,
				'ips': $('#syslogSelect').val()
			});
		} else if ($trg.is('#csvUpload')) {
			$('.tableImport').attr('disabled',$trg.val()=='');
		}
	});

	switch (location.hash) {
		case "#media":
			$('#nav-media-tab').click();
			break;
		case "#control":
			$('#nav-control-tab').click();
			break;
		case "#pings":
			$('#nav-pings-tab').click();
			break;
		case "#syslog":
			$('#nav-syslog-tab').click();
			break;
		case "#debug":
			$('#nav-debug-tab').click();
			break;
		default:
			break;
	}

});

function configRowEdit($trg) {
	let $row = $trg.closest('tr');
	$row.children().each(function() {
		let $td = $(this);
		switch ($td.data('type')) {
		case 'text': {
			let $txt = $(`<input type="text" class="form-control" value="${$td.data('value')}" name="${$td.data('key')}"></input>`);
			$txt.change(function() {
				$td.data('value', $txt.val());
			});
			$td.html('');
			$td.append($txt);
			break;
		}
		case 'check': {
			const checked = $td.data('value') ? 'checked' : '';
			let $txt = $(`<input type="checkbox" class="form-check-input" ${checked} name="${$td.data('key')}"></input>`);
			$txt.click(function() {
				$td.data('value', $txt.prop('checked'));
				$td.attr('data-value', $txt.prop('checked'));
			});
			$td.html('');
			$td.append($txt);
			break;
		}
		case 'range': {
			let $from = $(`<input type="text" class="editRange form-control text-end" value="${$td.data('from')}" name="${$td.data('key-from')}"></input>`);
			let $to = $(`<input type="text" class="editRange form-control" value="${$td.data('to')}" name="${$td.data('key-to')}"></input>`);
			$from.change(function() {
				$td.data('from', $from.val());
			});
			$to.change(function() {
				$td.data('to', $to.val());
			});
			$td.html('');
			$td.addClass('input-group');
			$td.append($from);
			$td.append('<span class="input-group-text">to</span>');
			$td.append($to);
			break;
		}
		case 'select': {
			let txt = `<select class="btn btn-outline-light" name="${$td.data('key')}">`;
			const options = $td.data('options').split(',');
			options.forEach(option => {
				const selected = option == $td.data('value') ? 'selected' : '';
				txt += `<option value="${option}" ${selected}>${option}</option>`;
			});
			txt += '</select>';
			const $txt = $(txt);
			$txt.change(function() {
				$td.data('value', $txt.val());
			});
			$td.html('');
			$td.append($txt);
			break;
		}
		default:
			break;
		}
		$trg.html('Done');
		$trg.removeClass('editConfig');
		$trg.removeClass('btn-danger');
		$trg.addClass('doneConfig');
		$trg.addClass('btn-success');
	});
}

function configRowDone($trg) {
	let $row = $trg.closest('tr');
	let data = {};
	$row.children().each(function() {
		let $td = $(this);
		let value = $td.data('value');
		switch ($td.data('type')) {
		case 'text':
			$td.html(value);
			data[$td.data('key')] = value;
			break;
		case 'check':
			$td.html('');
			data[$td.data('key')] = value;
			break;
		case 'range':
			$td.html(`${$td.data('from')} to ${$td.data('to')}`);
			data[$td.data('key-from')] = parseInt($td.data('from'));
			data[$td.data('key-to')] = parseInt($td.data('to'));
			$td.removeClass('input-group');
			break;
		case 'select':
			if (value == "") value = $td.children()[0].value
			$td.html(value);
			data[$td.data('key')] = value;
			break;
		default:
			break;
		}
		$trg.html('Edit');
		$trg.addClass('editConfig');
		$trg.addClass('btn-danger');
		$trg.removeClass('doneConfig');
		$trg.removeClass('btn-success');
	});
	let editor = $row.closest('table').data('editor');
	let current = editors[editor].get();
	current[$row.data('index')] = data;
	editors[editor].set(current);
	editors[editor].expandAll();
}

function getConfig(catagory) {
	return $.getJSON(`${server}getConfig?catagory=${catagory}`);
}

function renderEditorTab(devicesData, editor, template, element) {
	if (!editor) {
		const container = document.getElementById(`${element}Raw`);
		let options = {
			'onChange': function() {
				$(`#${element}`).html(ejs.render(template, {devices: editor.get(), switches: Switches.concat(ControlSwitches)}));
			},
			'mode': 'tree',
			'mainMenuBar': false,
			'navigationBar': false
		};
		editor = new JSONEditor(container, options);
	}
	editor.set(devicesData);
	editor.expandAll();
	$(`#${element}`).html(ejs.render(template, {devices: devicesData, switches: Switches.concat(ControlSwitches)}));
	return editor;
}

function download(filename, text) {
	var element = document.createElement('a')
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text))
	element.setAttribute('download', filename)
	element.style.display = 'none'
	document.body.appendChild(element)
	element.click()
	document.body.removeChild(element)
}

function doTableSort($trg, toggleDir = true) {
	const sortTag = $trg.attr('data-sort-tag');
	const tag = sortTag === undefined ? undefined : sortTag;
	const $th = $trg.closest('th');
	const $table = $th.closest('table');
	const $tbody = $table.find('tbody');
	const $rows = $tbody.children('tr');
	const index = $th.index();
	let dir = $th.hasClass('sortedDesc') ? -1 : 1;
	if (toggleDir) {
		if (!$th.hasClass('sorted')) dir = -1;
		$table.find('.sortedAsc').removeClass('sortedAsc');
		$table.find('.sortedDesc').removeClass('sortedDesc');
		$table.find('.sorted').removeClass('sorted');
		if (dir < 0) {
			dir = 1;
			$th.addClass('sortedAsc');
		} else {
			dir = -1;
			$th.addClass('sortedDesc');
		}
		$th.addClass('sorted');
	}
	$rows.sort((a, b) => {
		if (tag) {
			return (Number($(a).attr(`data-${tag}`)) - Number($(b).attr(`data-${tag}`)))*dir;
		} else {
			const aVal = $(a).children().eq(index).html();
			const bVal = $(b).children().eq(index).html();
			return aVal.localeCompare(bVal, undefined, { numeric: true })*dir;
		}
	});
	$rows.each(function(i, $row) {
		$tbody.append($row);
	})
}