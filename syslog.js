import udp from 'dgram';

export default class SysLogServer {
    constructor(
        logger,
		doSysLogMessage = () => {}
    ) {
        this.logger = logger;
		this.doSysLogMessage = doSysLogMessage;
    }

    start(port) {
        const server = udp.createSocket('udp4');
        server.on('error', error => {
            this.logger.error('Syslog Error', error);
            server.close();
        });
        
        server.on('message', (msg, info) => {
            this.logger.log('Data received from client : ' + msg.toString(), 'A');
            this.logger.log(`Received ${msg.length} bytes from ${info.address}:${info.port}`, 'A');
            this.doSysLogMessage(msg, info);
        });
        
        server.on('listening', () => {
            const address = server.address();
            this.logger.log('SysLog Server is listening at port: ' + address.port);
        });
        
        server.on('close', () => {
            console.log('Socket is closed !');
        });
        
        server.bind(port);
        return server;
    }
}