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
		const frame = document.getElementById('frame');
		frame.setAttribute('src', url);
		const body = document.getElementById('body');
		body.classList.add('loaded');
	});
	
	window.electronAPI.log((event, log) => {
		const Logs = document.getElementById('logs');

		const cols = [31,32,33,34,35,36,37];
		const specials = [1,2];
		const reset = 0;
		let currentCul = 37;
		let currnetSpec = 1;
	
		let logArr = log.split('[');
	
		let output = '';
	
		for (let index = 0; index < logArr.length; index++) {
			const element = logArr[index];
			const num = parseInt(element.substr(0, element.indexOf('m')));
			const text = element.substring(element.indexOf('m') + 1);
	
			if (cols.includes(num)) {
				currentCul = num;
			} else if (specials.includes(num)) {
				currnetSpec = num;
			} else if (num == reset) {
				currentCul = 37;
				currnetSpec = 1;
			}
	
			const colour = getClass(currentCul);
			const special = getClass(currnetSpec);
			output += `<span class="${colour} ${special}">${text}</span>`;
		}
	
		const $log = `<div class='log'>${output}</div>`;
		Logs.innerHTML += $log;
	});
	
	window.electronAPI.requestExit(() => {
		exitModal.show();
	});
	
	const configModal = new bootstrap.Modal(document.getElementById('config'));
	const exitModal = new bootstrap.Modal(document.getElementById('exitConfirm'));

	window.electronAPI.ready();

	document.getElementById('exit').addEventListener('click', () => {
		exitModal.show();
	});
	document.getElementById('cancel').addEventListener('click', () => {
		const body = document.getElementById('body');
		if (body.classList.contains('loaded')) {
			configModal.hide();
			window.electronAPI.config('stop');
		} else {
			exitModal.show();
		}
	});
	document.getElementById('exitYes').addEventListener('click', () => {
		window.electronAPI.window('exit');
	});
	document.getElementById('exitMinimise').addEventListener('click', () => {
		exitModal.hide();
		window.electronAPI.window('minimise');
	});
	document.getElementById('exitCancel').addEventListener('click', () => {
		exitModal.hide();
	});

	const toggleButton = document.getElementById('toggleView');
	toggleButton.addEventListener('click', () => {
		const body = document.getElementById('body');
		if (body.classList.contains('showLogs')) {
			toggleButton.innerText = 'Show Logs';
		} else {
			toggleButton.innerText = 'Show Monitoring';
		}
		body.classList.toggle('showLogs');
	});

	document.getElementById('startConfig').addEventListener('click', () => {
		window.electronAPI.config('start');
	});

	document.getElementById('showConfig').addEventListener('click', () => {
		window.electronAPI.config('show');
	});

	document.getElementById('clearLogs').addEventListener('click', () => {
		document.getElementById('logs').innerHTML = '';
	});

	document.getElementById('next').addEventListener('click', () => {
		const answerCont = document.getElementById('answerCont');
		let value;
		if (answerCont.classList.contains('freeform')) {
			value = document.getElementById('answer').value;
		} else {
			value = document.querySelector('input[name="answer"]:checked').value;
		}

		if (value == '') value = answerCont.getAttribute('data-current');

		window.electronAPI.configAnswer(value);
	});
});

function getClass(num) {
	let value;
	switch (num) {
	case 31:
		value = 'redLog';
		break;
	case 32:
		value = 'greenLog';
		break;
	case 33:
		value = 'yellowLog';
		break;
	case 34:
		value = 'blueLog';
		break;
	case 35:
		value = 'purpleLog';
		break;
	case 36:
		value = 'cyanLog';
		break;
	case 37:
		value = 'whiteLog';
		break;
	case 2:
		value = 'dimLog';
		break;
	case 1:
		value = 'brightLog';
		break;
	}
	return value;
}