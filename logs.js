const fs = require('fs');

module.exports = function (){
    this.r = "\x1b[31m";
    this.g = "\x1b[32m";
    this.y = "\x1b[33m";
    this.b = "\x1b[34m";
    this.p = "\x1b[35m";
    this.c = "\x1b[36m";
    this.w = "\x1b[37m";
    this.reset = "\x1b[0m";
    this.dim = "\x1b[2m";
    this.bright = "\x1b[1m";
    this.createLogFile = true;
    this.logsFileName = "Test";
    this.configLocation = __dirname;
    this.loggingLevel = "A";
    this.debugLineNum = true;

    this.setLogsConf = function(conf) {
        createLogFile = conf?.createLogFile;
        logsFileName = conf?.logsFileName;
        configLocation = conf?.configLocation;
        loggingLevel = conf?.loggingLevel;
        debugLineNum = conf?.debugLineNum;
    }

    this.printHeader = function(asci) {
        console.log('\033[2J');
        console.log('\033c');
        for (this.index = 0; index < asci.length; index++) {
            const line = asci[index];
            console.log(line);
            logFile(line, true);
        }
    },

    this.loadArgs = function() {
        if (typeof args[0] !== "undefined") {
            if (args[0] == "--help" || args[0] == "-h" || args[0] == "-H" || args[0] == "--h" || args[0] == "--H") {
                log(`You can start the server with two arguments: (config path) (logging level)`, "H");
                log(`The first argument is the relative path of the config file, eg (${y}.${reset}) or (${y}/Config1${reset})`, "H");
                log(`The second argument is the desired logging level ${w+dim}(A)ll${reset}, ${c}(D)ebug${reset}, ${y}(W)arnings${reset}, ${r}(E)rrors${reset}`, "H");
                process.exit(1);
            }
            if (args[0] == ".") {
                args[0] = "";
            }
            configLocation = __dirname + args[0];
        } else {
            configLocation = __dirname;
        }

        if (typeof args[1] !== "undefined") {
            argLoggingLevel = args[1];
        }
    },

    this.log = function(message, level, lineNumInp) {
        this.e = new Error();
        this.stack = e.stack.toString().split(/\r\n|\n/);
        this.parentModFilename = module.parent.filename.split(/\\|\//).pop()
        this.lineNum = '('+stack[2].substr(stack[2].indexOf(parentModFilename)+parentModFilename.length+1);
        if (typeof lineNumInp !== "undefined") {
            lineNum = lineNumInp;
        }
        if (lineNum[lineNum.length - 1] !== ")") {
            lineNum += ")";
        }
        this.timeNow = new Date();
        this.hours = String(timeNow.getHours()).padStart(2, "0");
        this.minutes = String(timeNow.getMinutes()).padStart(2, "0");
        this.seconds = String(timeNow.getSeconds()).padStart(2, "0");
        this.millis = String(timeNow.getMilliseconds()).padStart(3, "0");

        this.timeString = `${hours}:${minutes}:${seconds}.${millis}`;

        if (typeof message === "undefined") {
            log(`Log message from line ${p}${lineNum}${reset} is not defined`, "E");
            return;
        } else if (typeof message !== "string") {
            log(`Log message from line ${p}${lineNum}${reset} is not a string so attemping to stringify`, "A");
            try {
                message = JSON.stringify(message, null, 4);
            } catch (e) {
                log(`Log message from line ${p}${lineNum}${reset} could not be converted to string`, "E");
            }
        }

        if (debugLineNum == false || debugLineNum == "false") {
            lineNum = "";
        }

        message = message.replace(/true/g, g + "true" + w);
        message = message.replace(/false/g, r + "false" + w);
        message = message.replace(/null/g, y + "null" + w);
        message = message.replace(/undefined/g, y + "undefined" + w);

        const regexp = / \((.*?):(.[0-9]*):(.[0-9]*)\)"/g;
        this.matches = message.matchAll(regexp);
        for (this.match of matches) {
            message = message.replace(match[0], `" [${y}${match[1]}${reset}] ${p}(${match[2]}:${match[3]})${reset}`);
        }

        switch (level) {
            case "A":
            case "I":
                if (loggingLevel == "A") { //White
                    logSend(`[${timeString}]${w}  INFO: ${dim}${message}${bright} ${p}${lineNum}${reset}`);
                }
                break;
            case "D":
                if (loggingLevel == "A" || loggingLevel == "D") { //Cyan
                    logSend(`[${timeString}]${c} DEBUG: ${w}${message} ${p}${lineNum}${reset}`);
                }
                break;
            case "S":
            case "N":
                if (loggingLevel != "E") { //Blue
                    logSend(`[${timeString}]${b} NETWK: ${w}${message} ${p}${lineNum}${reset}`);
                }
                break;
            case "W":
                if (loggingLevel != "E") { //Yellow
                    logSend(`[${timeString}]${y}  WARN: ${w}${message} ${p}${lineNum}${reset}`);
                }
                break;
            case "E": //Red
                logSend(`[${timeString}]${r} ERROR: ${w}${message} ${p}${lineNum}${reset}`);
                break;
            case "H": //Green
                logSend(`[${timeString}]${g}  HELP: ${w}${message}`);
                break;
            case "C":
            default: //Green
                logSend(`[${timeString}]${g}  CORE: ${w}${message} ${p}${lineNum}${reset}`);
        }
    },

    this.logObj = function(message, obj, level) {
        this.e = new Error();
        this.stack = e.stack.toString().split(/\r\n|\n/);
        this.parentModFilename = module.parent.filename.split(/\\|\//).pop()
        this.lineNum = '('+stack[2].substr(stack[2].indexOf(parentModFilename)+parentModFilename.length+1);

        this.combined = `${message}: ${JSON.stringify(obj, null, 4)}`;
        log(combined, level, lineNum);
    }

    this.logSend = function(message) {
        logFile(message);
        console.log(message);
    }
    
    this.logFile = function(msg, sync = false) {
        if (createLogFile) {
            this.dir = `${configLocation}/logs`;
    
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, {
                    recursive: true
                });
            }
    
            this.today = new Date();
            this.dd = String(today.getDate()).padStart(2, '0');
            this.mm = String(today.getMonth() + 1).padStart(2, '0');
            this.yyyy = today.getFullYear();
    
            this.fileName = `${dir}/${logsFileName}-[${yyyy}-${mm}-${dd}].log`;
            this.data = msg.replaceAll(r, "").replaceAll(g, "").replaceAll(y, "").replaceAll(b, "").replaceAll(p, "").replaceAll(c, "").replaceAll(w, "").replaceAll(reset, "").replaceAll(dim, "").replaceAll(bright, "") + "\n";
    
            if (sync) {
                try {
                    fs.appendFileSync(fileName, data);
                } catch (error) {
                    createLogFile = false;
                    log("Could not write to log file, permissions?", "E");
                }
            } else {
                fs.appendFile(fileName, data, err => {
                    if (err) {
                        createLogFile = false;
                        log("Could not write to log file, permissions?", "E");
                    }
                });
            }
        }
    }
}