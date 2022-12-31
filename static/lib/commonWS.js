/*jshint esversion: 6 */

class webSocket extends EventTarget {
	constructor(type, clientVersion, ssl = false) {
		super();
		this.loadTime = new Date().getTime();
		this.clientID = `${type.charAt(0)}_${this.loadTime}_${clientVersion}`;
		this.version = clientVersion;
		this.type = type;

		this.connecting = false;
		this.currentServer;
		this.server;
		this.forceShut = false;
		this.serverURL;
		this.protocol = 'ws';

		if (ssl) {
			this.protocol = 'wss';
		}
	}

	connect(serverURL) {
		if (this.serverURL !== serverURL) {
			if (typeof this.server !== 'undefined') {
				this.server.disconnect();
			}
			this.server = null;
			this.serverURL = serverURL;
			this.connecting = false;
		}
		if (this.connecting) return this.server;
		this.connecting = true;
		console.log(`Connecting to: ${this.protocol}://${this.serverURL}`);
		this.server = new WebSocket(`${this.protocol}://${this.serverURL}`);

		this.server.onopen = event => {
			console.log('Connection established!');
			this.connecting = false;
			this.dispatchEvent(new Event('open'));
		};

		this.server.onmessage = event => {
			const packet = JSON.parse(event.data);
			const header = packet.header;
			const payload = packet.payload;
			switch (payload.command) {
			case 'ping':
				this.send({'command':'pong'});
				this.dispatchEvent(new Event('ping'));
				break;
			default:
				this.dispatchEvent(new CustomEvent('message', {detail: [header, payload, event]}));
				break;
			}
		};

		this.server.onclose = () => {
			if (!this.forceShut) {
				console.log('Connection ended');
				setTimeout(() => {
					this.connect(this.serverURL);
				}, 500);
			}
			this.forceShut = false;
			this.dispatchEvent(new Event('close'));
		};

		this.server.disconnect = () => {
			this.forceShut = true;
			this.server.close();
			this.dispatchEvent(new Event('disconnect'));
		};

		return this.server;
	}

	makeHeader() {
		const header = {
			'fromID': this.clientID,
			'timestamp': new Date().getTime(),
			'version': version,
			'type': this.type,
			'system': currentSystem,
			'active': false,
		};
		if (this.connecting == 0) {
			header.active = true;
		}
		header.messageID = header.timestamp;
		return header;
	}

	send(payload) {
		this.server.send(JSON.stringify({
			'header': this.makeHeader(),
			'payload': payload
		}));
	}

}