/* eslint-disable no-undef */
let server = window.location;

let editors = {};

let pingChart;
let tempChart;
let bootChart;
let pings = {};
let boots = {};
let lastTra = -1;
let lastAlive = -1;
let lastMac = -1;
let lastPhy = -1;
let lastUps = -1;
let lastUpsHash = '';
let lastPing = -1;
let lastHot = -1;
let lastBoot = -1;

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

templates.switch = `<% for(i = 0; i < devices.length; i++) { %>
  <tr data-index="<%=i%>" data-template="switch">
    <td data-type="text" data-key="Name" data-value="<%-devices[i].Name%>"><%-devices[i].Name%></td>
    <td data-type="text" data-key="IP" data-value="<%-devices[i].IP%>"><%-devices[i].IP%></td>
    <td data-type="text" data-key="User" data-value="<%-devices[i].User%>"><%-devices[i].User%></td>
    <td data-type="text" data-key="Pass" data-value="<%-devices[i].Pass%>"><%-devices[i].Pass%></td>
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
				lastPing = Date.now();
				pingChart.update();
				break;
			case 'boot': {
				if (payload.replace) {
					bootChart.data.datasets[0].data = payload.points;
				} else {
					const dateBoot = new Date(parseInt(payload.time));
					bootChart.data.datasets[0].data[dateBoot] = 1;
				}
				lastBoot = Date.now();
				bootChart.update();
				break;
			}
			case 'temps':
				if (payload.replace) {
					replaceTemps(payload.points);
				} else {
					addTemps(payload.points);
				}
				lastHot = Date.now();
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
			handleFibreData(payload.data);
			break;
		case 'devices':
			handleDevicesData(payload.data);
			break;
		case 'mac':
			handleMacData(payload.data);
			break;
		case 'phy':
			handlePhyData(payload.data);
			break;
		default:
			break;
		}
		break;
	default:

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

/* Device data handeling */

function handleFibreData(data) {
	$('table#tra tbody').empty();
	if (Object.keys(data).length == 0) {
		$('div#col-tra').addClass('text-muted');
		$('table#tra').addClass('text-muted');
	}
	else {
		$('div#col-tra').removeClass('text-muted');
		$('table#tra').removeClass('text-muted');
		$.each(data, (k, v) => {
			let lldp = v.lldp ? v.lldp : '<em class="text-muted">n/a</em>';
			let feeding;
			if (typeof v.description !== 'undefined') {
				feeding = v.description;
			} else {
				feeding = '<em class="text-muted">n/a</em>';
			}
			let s = `<tr><td>${v.switch}</td><td>${v.port}</td><td>${lldp}</td><td>${feeding}</td><td>${v.rxPower} dBm</td></tr>`;
			$('table#tra tbody').append(s);
		});
	}
	lastTra = Date.now();
}

function handleDevicesData(data) {
	$('table#alive tbody').empty();
	if (Object.keys(data).length == 0) {
		$('div#col-alive').addClass('text-muted');
		$('table#alive').addClass('text-muted');
	} else {
		$('div#col-alive').removeClass('text-muted');
		$('table#alive').removeClass('text-muted');
		$.each(data, (k, v) => {
			let s = '<tr><td>' + k + '</td>';
			for (let index = 0; index < Switches.length; index++) {
				if (v.includes(Switches[index])) {
					s += '<td class=\'bg-danger\'>DOWN</td>';
				} else {
					s += '<td class=\'bg-success\'>UP</td>';
				}
				
			}
			$('table#alive tbody').append(s);
		});
	}
	lastAlive = Date.now();
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
	lastMac = Date.now();
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
	lastPhy = Date.now();
}

function handleUPSData(data) {
	let hash = CryptoJS.MD5(JSON.stringify(data)).toString();
	if (lastUpsHash !== '' && hash !== lastUpsHash) {
		if (Object.keys(data).length > 0) {
			//saySomething("you pee ess broken")
		}
	} else if (lastUpsHash === '' && data.length > 0) {
		//saySomething("you pee ess broken")
	}
	lastUpsHash = hash;

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
	lastUps = Date.now();
}

function updateLast() {
	$('#lastAlive').text(prettifyTime(lastAlive));
	$('#lastMac').text(prettifyTime(lastMac));
	$('#lastPhy').text(prettifyTime(lastPhy));
	$('#lastUps').text(prettifyTime(lastUps));
	$('#lastTra').text(prettifyTime(lastTra));
	$('#lastPing').text(prettifyTime(lastPing));
	$('#lastBoot').text(prettifyTime(lastBoot));
	$('#lastHot').text(prettifyTime(lastHot));
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
		$('#webBroken').html('<span class="badge badge-pill bg-secondary">Web Monitor Disabled</span>');
		return null;
	}

	renderPingChart();
	renderBootChart(boots);

	$('#webBroken').html('<span class="badge badge-pill bg-danger">Web Monitor Offline</span>');
	const webConnection = new webSocket([webSocketEndpoint], 'Browser', version, currentSystem, secureWebsockets);
	webConnection.addEventListener('message', event => {
		const [header, payload] = event.detail;
		socketDoMessage(header, payload);
	});
	webConnection.addEventListener('open', () => {
		socketDoOpen(webConnection);
		$('#webBroken').html('<span class="badge badge-pill bg-success">Website Online</span>');
	});
	webConnection.addEventListener('close', () => {
		$('#webBroken').html('<span class="badge badge-pill bg-danger">Web Monitor Offline</span>');
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
		$('#broken').html('<span class="badge badge-pill bg-success">Argos Online</span>');
	});
	localConnection.addEventListener('close', () => {
		$('#broken').html('<span class="badge badge-pill bg-danger">Argos Offline</span>');
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
				$('#toggleConfig').toggleClass('rotate');
				loading(true);
				Promise.allSettled([
					getConfig('switches'),
					getConfig('devices'),
					getConfig('ups'),
					getConfig('frames')
				]).then(values => {
					const [switches, devices, ups, frames] = values;
					loading(false);
					$('#config').removeClass('hidden');
					editors['switches'] = renderEditorTab(switches.value, editors['switches'], templates.switch, 'configSwitches');
					editors['devices'] = renderEditorTab(devices.value, editors['devices'], templates.devices, 'configDevices');
					editors['ups'] = renderEditorTab(ups.value, editors['ups'], templates.nameIP, 'configUps');
					editors['frames'] = renderEditorTab(frames.value, editors['frames'], templates.nameIP, 'configFrames');
				}).catch(error => {
					console.error(error);
				});
			} else {
				$('#config').addClass('hidden');
			}
		} else if ($trg.hasClass('toggleTableRaw')) {
			const $active = $trg.closest('.alert.container').find('.tab-pane.active');
			$active.find('.dataTable').collapse('toggle');
			$active.find('.dataRaw').collapse('toggle');
		} else if ($trg.hasClass('editConfig')) {
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
				default:
					break;
				}
				$trg.html('Done');
				$trg.removeClass('editConfig');
				$trg.removeClass('btn-danger');
				$trg.addClass('doneConfig');
				$trg.addClass('btn-success');
			});
		} else if ($trg.hasClass('doneConfig')) {
			let $row = $trg.closest('tr');
			let data = {};
			$row.children().each(function() {
				let $td = $(this);
				switch ($td.data('type')) {
				case 'text':
					$td.html($td.data('value'));
					data[$td.data('key')] = $td.data('value');
					break;
				case 'range':
					$td.html(`${$td.data('from')} to ${$td.data('to')}`);
					data[$td.data('key-from')] = parseInt($td.data('from'));
					data[$td.data('key-to')] = parseInt($td.data('to'));
					$td.removeClass('input-group');
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
			case 'devices':
				dummyData[0].name = 'New Device';
				dummyData[0].description = 'Description';
				break;
			default:
				break;
			}
			const $new = $(ejs.render(templates[template], {'devices': dummyData}));
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
		}
	});
});

function getConfig(catagory) {
	return $.getJSON(`${server}getConfig?catagory=${catagory}`);
}

function renderEditorTab(devicesData, editor, template, element) {
	if (!editor) {
		const container = document.getElementById(`${element}Raw`);
		let options = {
			'onChange': function() {
				$(`#${element}`).html(ejs.render(template, {devices: editor.get()}));
			},
			'mode': 'tree',
			'mainMenuBar': false,
			'navigationBar': false
		};
		editor = new JSONEditor(container, options);
	}
	editor.set(devicesData);
	editor.expandAll();
	$(`#${element}`).html(ejs.render(template, {devices: devicesData}));
	return editor;
}