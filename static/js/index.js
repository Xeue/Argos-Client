document.addEventListener('DOMContentLoaded', () => {
	window.electronAPI.configQuestion((event, message) => {

		const configElement = document.getElementById('config');
	
		const msgObject = JSON.parse(message);
		const question = document.getElementById('question');
		const answerCont = document.getElementById('answerCont');
		question.innerHTML = msgObject.question + '?';
		answerCont.setAttribute('data-current', msgObject.current);
	
		if (typeof msgObject.options === 'undefined') {
			const placeholder = typeof msgObject.current == 'undefined' ? '' : msgObject.current;
			const input = `<input type="text" id="answer" placeholder="${placeholder}">`;
			answerCont.classList.add('freeform');
			answerCont.classList.remove('select');
			answerCont.innerHTML = input;
		} else {
			let options = '';
			let optionsPretty = '';
			let hasDescription = false;
	
			if (!Array.isArray(msgObject.options)) {
				hasDescription = true;
				[msgObject.options, optionsPretty] = [Object.keys(msgObject.options), msgObject.options];
			}
	
			msgObject.options.forEach(option => {
				const checked = String(option) == String(msgObject.current) ? 'checked=checked' : '';
				const label = hasDescription ? optionsPretty[option] : option;
				options += `<label for="answer_${option}">${label}<input type="radio" class="answerRadio" name="answer" id="answer_${option}" value="${option}" ${checked}></label>`;
			});
			answerCont.classList.remove('freeform');
			answerCont.classList.add('select');
			answerCont.innerHTML = options;
		}
	
		if (!configElement.classList.contains('show')) {
			configModal.show();
		}
	});

	window.electronAPI.configDone(() => {
		configModal.hide();
	});
	
	window.electronAPI.loaded((event, url) => {
		const _mainFrame = document.getElementById('mainFrame');
		const _dataFrame = document.getElementById('dataFrame');
		const _aboutFrame = document.getElementById('aboutFrame');
		_mainFrame.setAttribute('src', url+'/app');
		_dataFrame.setAttribute('src', url+'/appData');
		_aboutFrame.setAttribute('src', url+'/appAbout');
		const _body = document.getElementById('body');
		_body.classList.add('loaded');
	});
	
	window.electronAPI.log((event, log) => {
		doLog(log);
	});
	
	window.electronAPI.requestExit(() => {
		exitModal.show();
	});
	
	const configModal = new bootstrap.Modal(document.getElementById('config'));
	const exitModal = new bootstrap.Modal(document.getElementById('exitConfirm'));

	window.electronAPI.ready();

	on('click', '#exit', () => exitModal.show())
	on('click', '#cancel', () => {
		const _body = document.getElementById('body');
		if (_body.classList.contains('loaded')) {
			configModal.hide();
			window.electronAPI.config('stop');
		} else {
			exitModal.show();
		}
	})

	on('click', '#exitYes', () => window.electronAPI.window('exit'));
	on('click', '#exitCancel', () => exitModal.hide());
	on('click', '#exitMinimise', () => {
		exitModal.hide();
		window.electronAPI.window('minimise');
	});

	on('click', '.pageShow', _element => {
		const _body = document.getElementById('body');
		const page = _element.getAttribute('data-page');
		_body.setAttribute('data-page', page);
		if (page == 'data') document.getElementById('dataFrame').src += '';
		if (page == 'about') document.getElementById('aboutFrame').src += '';
	})

	on('click', '#startConfig', () => window.electronAPI.config('start'));
	on('click', '#showConfig', () => window.electronAPI.config('show'));
	on('click', '#clearLogs', () => document.getElementById('logs').innerHTML = '');

	on('click', '#next', () => {
		const _answerCont = document.getElementById('answerCont');
		let value;
		if (_answerCont.classList.contains('freeform')) {
			value = document.getElementById('answer').value;
		} else {
			value = document.querySelector('input[name="answer"]:checked').value;
		}

		if (value == '') value = _answerCont.getAttribute('data-current');
		console.log(value);
		window.electronAPI.configAnswer(value);
	});
});

function doLog(log) {
	const _logs = document.getElementById('logs');
	const cols = [31,32,33,34,35,36,37];
	const specials = [1,2];
	const reset = 0;
	let currentCul = getClass(log.textColour);
	let currnetSpec = 1;
	let output = `<span class="logTimestamp">[${log.timeString}]</span><span class="logLevel ${getClass(log.levelColour)}">(${log.level})</span><span class="${getClass(log.colour)} logCatagory">${log.catagory}${log.seperator} </span>`;
	const logArr = log.message.split('\x1b[');
	logArr.forEach((element, index) => {
		const num = parseInt(element.substr(0, element.indexOf('m')));
		const text = index==0 ? element : element.substring(element.indexOf('m') + 1);
		if (cols.includes(num)) {
			currentCul = num;
		} else if (specials.includes(num)) {
			currnetSpec = num;
		} else if (num == reset) {
			currentCul = 37;
			currnetSpec = 1;
		}
		output += `<span class="${getClass(currentCul)} ${getClass(currnetSpec)}">${text}</span>`;
	})
	output += `<span class="purpleLog logLinenum"> ${log.lineNumString}</span>`;

	const _log = `<div class='log' data-level="${log.level}">${output}</div>`;
	_logs.innerHTML = _log + _logs.innerHTML;
	const maxLogs = 499;
	_logs.childElementCount
	if (_logs.childElementCount > maxLogs) {
		_logs.children[maxLogs+1].remove();
	}
}

function getClass(num) {
	if (typeof num == 'string') {
		num = parseInt(num.substring(num.indexOf('m')-2, num.indexOf('m')));
	}
	if (num == 31) return 'redLog';
	if (num == 32) return 'greenLog';
	if (num == 33) return 'yellowLog';
	if (num == 34) return 'blueLog';
	if (num == 35) return 'purpleLog';
	if (num == 36) return 'cyanLog';
	if (num == 37) return 'whiteLog';
	if (num == 2) return 'dimLog';
	if (num == 1) return 'brightLog';
	return 'whiteLog';
}


/* Utility */

function on(eventNames, selectors, callback) {
	if (!Array.isArray(selectors)) selectors = [selectors];
	if (!Array.isArray(eventNames)) eventNames = [eventNames];
	selectors.forEach(selector => {
		eventNames.forEach(eventName => {
			if (selector.nodeType) {
				selector.addEventListener(eventName, event => {callback(event.target)});
			} else {
				document.addEventListener(eventName, event => {
					if (event.target.matches(selector)) callback(event.target);
				});
			};
		});
	});
};
