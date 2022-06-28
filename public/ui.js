let server = window.location;

let pingTimeout;
let pingChart;
let tempChart;
let bootChart;
let f = {};
let m = {};
let b = {};
let a = {};
let pings = {};
let boots = {};

function socketDoOpen() {
  console.log("Registering as client");
  sendData({"command":"register"});
}

function waitForPing() {
  pingTimeout = setTimeout(function(){
    pings[new Date()] = 0;
    pingChart.data.datasets[0].data[new Date()] = 0;
    pingChart.update();
    $("#pingTime").html("Late ping?");
    waitForPing();
  }, 10000);
}

function socketDoMessage(packet, header, payload, e) {
  indicatior = $("#t_indicatior");

  switch (payload.command) {
    case "data":
      switch (payload.data) {
        case "ping":
          clearTimeout(pingTimeout);
          let datePing = new Date(payload.time);
          pings[datePing] = payload.status;
          if (payload.status == 1) {
            $("#pingTime").html(datePing);
          }
          pingChart.update();
          waitForPing();
          break;
        case "boot":
          let dateBoot = new Date(payload.time);
          boots[dateBoot] = 1;
          $("#bootTime").html(dateBoot);
          bootChart.update();
          break;
        case "temps":
          let dateTemp = new Date(payload.time);
          f[dateTemp] = payload.front;
          m[dateTemp] = payload.middle;
          b[dateTemp] = payload.back;
          a[dateTemp] = payload.average;
          $("#tempTime").html(dateTemp);
          tempChart.update();
          break;
      }
      break;
    case "command":
      if (payload.serial == myID) {
        switch (payload.action) {
          case "identify":
            $("#t_indicatior").addClass("identify");
            setTimeout(function(){
              $("#t_indicatior").removeClass("identify");
            }, 4000);
            break;
          default:

        }
      }
      break;
    default:

  }
}

function renderTempChart(f,m,b,a) {
  const ctx = $('#tempChart');
  const data = {
    datasets: [
      {
        label: 'Front Rack',
        data: f,
        backgroundColor: [
            'rgba(54, 162, 235, 0.2)'
        ],
        borderColor: [
            'rgba(54, 162, 235, 1)'
        ]
      },
      {
        label: 'Middle Rack',
        data: m,
        backgroundColor: [
            'rgba(255, 206, 86, 0.2)'
        ],
        borderColor: [
            'rgba(255, 206, 86, 1)'
        ]
      },
      {
        label: 'Back Rack',
        data: b,
        backgroundColor: [
            'rgba(255, 99, 132, 0.2)'
        ],
        borderColor: [
            'rgba(255, 99, 132, 1)'
        ]
      },
      {
        label: 'Average',
        data: a,
        backgroundColor: [
            'rgba(255, 255, 255, 0.2)'
        ],
        borderColor: [
            'rgba(255, 255, 255, 1)'
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
              second: 'MM/DD/yy H:mm:ss',
              minute: 'MM/DD/yy H:mm:ss',
              hour: 'MM/DD/yy H:mm:ss'
            }
          }
        }
      }
    },
  };
  tempChart = new Chart(ctx, config);

}

function renderPingChart(pings) {
  const ctx = $('#pingChart');
  const data = {
    datasets: [
      {
        label: 'Wimbledons Online',
        data: pings,
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
              second: 'MM/DD/yy H:mm:ss',
              minute: 'MM/DD/yy H:mm:ss',
              hour: 'MM/DD/yy H:mm:ss'
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
        label: 'Boots',
        data: boots,
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
              second: 'MM/DD/yy H:mm:ss',
              minute: 'MM/DD/yy H:mm:ss',
              hour: 'MM/DD/yy H:mm:ss'
            }
          }
        }
      }
    },
  };
  bootChart = new Chart(ctx, config);

}


socketConnect("Browser");

$(document).ready(function() {
    updateTempchart("7200");
    updatePingChart("7200");
    $(document).click(function(e) {
        $trg = $(e.target);
        if ($trg.hasClass("tempBut")) {
            let time = parseInt($trg.data("time"));
            updateTempchart(time);
        } else if ($trg.hasClass("pingBut")) {
            let time = parseInt($trg.data("time"));
            updatePingChart(time);
        }
    });

  renderPingChart(pings);
  renderBootChart(boots);
  renderTempChart(f,m,b,a);
});

function updateTempchart(time) {
    let to = new Date().getTime()/1000;
    let from = to - time;
    $.get(`https://${servers[0]}/REST/getTemps?from=${from}&to=${to}`, function(data, status){
        data = JSON.parse(data);
        f = {};
        m = {};
        b = {};
        a = {};
        const rF = Object.keys(data.f);
        rF.forEach(key => {
            if (data.f[key] != -1) {
                f[new Date(key)] = data.f[key];
            } else {
                f[new Date(key)] = data.a[key];
            }
        });
        const rM = Object.keys(data.m);
        rM.forEach(key => {
            if (data.m[key] != -1) {
                m[new Date(key)] = data.m[key];
            } else {
                m[new Date(key)] = data.a[key];
            }
        });
        const rB = Object.keys(data.b);
        rB.forEach(key => {
            if (data.b[key] != -1) {
                b[new Date(key)] = data.b[key];
            } else {
                b[new Date(key)] = data.a[key];
            }
        });
        const rA = Object.keys(data.a);
        rA.forEach(key => {
            if (data.a[key] != -1) {
                a[new Date(key)] = data.a[key];
            }
        });
        tempChart.data.datasets[0].data = f;
        tempChart.data.datasets[1].data = m;
        tempChart.data.datasets[2].data = b;
        tempChart.data.datasets[3].data = a;
        tempChart.update();
    });
}

function updatePingChart(time) {
    let to = new Date().getTime()/1000;
    let from = to - time;
    $.get(`https://${servers[0]}/REST/getPings?from=${from}&to=${to}`, function(data, status){
        data = JSON.parse(data);
        pings = {};

        const rP = Object.keys(data);
        rP.forEach(key => {
            pings[new Date(key)] = data[key];
        });
        pingChart.data.datasets[0].data = pings;
        pingChart.update();
    });
}

function saySomething(text) {
    let synth = window.speechSynthesis;
    var utterThis = new SpeechSynthesisUtterance(text);
    let voices = synth.getVoices()
    for (let i in voices) {
        if (voices[i].lang === "cy-GB") utterThis.voice = voices[i]
    }
    utterThis.rate = 0.8;
    if (synth.speaking) {
        setTimeout(() => { saySomething(text) }, 250)
    } else {
        synth.speak(utterThis);
    }
}

$(document).ready(function () {
    getBroken()
    getDevices()
    getMac()
    getPhy()
    getUps()
    getFibre()

    setInterval(updateLast, 1000)

    $('button#cut').on('click', () => {
        let audio = new Audio('media/cut.ogg')
        audio.play()
    })
});

let lastTra = -1
function getFibre() {
    $.getJSON(`${server}fibre`, function (data) {
        $('table#tra tbody').empty()
        if (data.length == 0) {
            $('div#col-tra').addClass("text-muted")
            $('table#tra').addClass("text-muted")
        }
        else {
            $('div#col-tra').removeClass("text-muted")
            $('table#tra').removeClass("text-muted")
            $.each(data, (k, v) => {
                let lldp = v.lldp ? v.lldp : `<em class="text-muted">n/a</em>`
                let feeding;
                if (typeof v.description !== "undefined") {
                    feeding = v.description;
                } else {
                    feeding = `<em class="text-muted">n/a</em>`
                }
                let s = `<tr><td>${v.switch}</td><td>${v.port}</td><td>${lldp}</td><td>${feeding}</td><td>${v.rxPower} dBm</td></tr>`
                $('table#tra tbody').append(s)
            })
        }
        lastTra = Date.now()
        setTimeout(getFibre, 30000)
    }).fail(function () {
        setTimeout(getFibre, 30000)
    });
}

let lastBroken = true
function getBroken() {
    $.get(`${server}broken`, function (data) {
        lastBroken = false
        $('#broken').html(`<span class="badge badge-pill bg-success">Argos Ok</span>`)
        setTimeout(getBroken, 5000)
    }).fail(function () {
        if (!lastBroken) {
            // broken
            lastBroken = true
        }
        $('#broken').html(`<span class="badge badge-pill bg-danger">Argos Broken</span>`)
        setTimeout(getBroken, 1000)
    })
}

let lastAlive = -1
function getDevices() {
    $.getJSON(`${server}devices`, function (data) {
        $('table#alive tbody').empty()
        if (Object.keys(data).length == 0) {
            $('div#col-alive').addClass("text-muted")
            $('table#alive').addClass("text-muted")
        } else {
            $('div#col-alive').removeClass("text-muted")
            $('table#alive').removeClass("text-muted")
            $.each(data, (k, v) => {
                let s = `<tr><td>` + k + `</td>`;
                for (let index = 0; index < Switches.length; index++) {
                    const Switch = Switches[index];
                    s += (v[index]) ? "<td class='bg-danger'>&nbsp;</td>" : "<td ></td>"
                }
                $('table#alive tbody').append(s)
            })
        }
        lastAlive = Date.now()
        setTimeout(getDevices, 10000)
    }).fail(function () {
        setTimeout(getDevices, 10000)
    });
}

let lastMac = -1
function getMac() {
    $.getJSON(`${server}mac`, function (data) {
        $('table#mac tbody').empty()
        if (data.length == 0) {
            $('div#col-mac').addClass("text-muted")
            $('table#mac').addClass("text-muted")
        }
        else {
            $('div#col-mac').removeClass("text-muted")
            $('table#mac').removeClass("text-muted")
            $.each(data, (k, v) => {
                let lldp = v.lldp ? v.lldp : `<em class="text-muted">n/a</em>`
                let feeding;
                if (typeof v.description !== "undefined") {
                    feeding = v.description;
                } else {
                    feeding = `<em class="text-muted">n/a</em>`
                }
                let s = `<tr><td>${v.switch}</td><td>${v.port}</td><td>${lldp}</td><td>${feeding}</td><td>${v.mac.phyState}</td><td>${v.mac.lastChange}</td></tr>`
                $('table#mac tbody').append(s)
            })
        }
        lastMac = Date.now()
        setTimeout(getMac, 10000)
    }).fail(function () {
        setTimeout(getMac, 10000)
    })
}

let lastPhy = -1
function getPhy() {
    $.getJSON(`${server}phy`, function (data) {
        $('table#phy tbody').empty()
        if (data.length == 0) {
            $('div#col-phy').addClass("text-muted")
            $('table#phy').addClass("text-muted")
        }
        else {
            $('div#col-phy').removeClass("text-muted")
            $('table#phy').removeClass("text-muted")
            $.each(data, (k, v) => {
                let lldp = v.lldp ? v.lldp : `<em class="text-muted">n/a</em>`
                let feeding;
                if (typeof v.description !== "undefined") {
                    feeding = v.description;
                } else {
                    feeding = `<em class="text-muted">n/a</em>`
                }
                let s = `<tr><td>${v.switch}</td><td>${v.port}</td><td>${lldp}</td><td>${feeding}</td><td>${v.phy.changes}</td><td>${v.phy.lastChange}</td></tr>`
                $('table#phy tbody').append(s)
            })
        }
        lastPhy = Date.now()
        setTimeout(getPhy, 30000)
    }).fail(function () {
        setTimeout(getPhy, 30000)
    })
}

let lastUps = -1
let lastUpsHash = ""
function getUps() {
    $.getJSON(`${server}ups`, function (data) {
        let hash = CryptoJS.MD5(JSON.stringify(data)).toString()
        if (lastUpsHash !== "" && hash !== lastUpsHash) {
            if (data.length > 0) {
                saySomething("you pee ess broken")
            }
        } else if (lastUpsHash === "" && data.length > 0) {
            saySomething("you pee ess broken")
        }
        lastUpsHash = hash

        $('table#ups tbody').empty()
        if (data.length == 0) {
            $('div#col-ups').addClass("text-muted")
            $('table#ups').addClass("text-muted")
        }
        else {
            $('div#col-ups').removeClass("text-muted")
            $('table#ups').removeClass("text-muted")
            $.each(data, (k, v) => {
                let s
                if (v.Status === "Offline") {
                    s = `<tr><td>${v.Name}</td><td colspan="4" class="text-center">Offline</td></tr>`
                } else {
                    s = `<tr><td>${v.Name}</td><td>${v.voltageIn}V ${v.freqIn}Hz</td><td>${v.voltageOut}V ${v.freqOut}Hz</td><td>${v.autonomy} min</td><td>${v.load}%</td></tr>`
                }
                $('table#ups tbody').append(s)
            })
        }
        lastUps = Date.now()
        setTimeout(getUps, 30000)
    }).fail(function () {
        setTimeout(getUps, 30000)
    })
}

function updateLast() {
    $('#lastAlive').text(prettifyTime(lastAlive))
    $('#lastMac').text(prettifyTime(lastMac))
    $('#lastPhy').text(prettifyTime(lastPhy))
    $('#lastUps').text(prettifyTime(lastUps))
    $('#lastTra').text(prettifyTime(lastTra))
}

function prettifyTime(time) {
    if (time == -1) {
        return "never"
    }
    let t = Math.floor((Date.now() - time) / 1000)
    let minutes = Math.floor(t / 60)
    let seconds = t % 60
    if (minutes == 0 && seconds == 0) {
        return "just now"
    } else if (minutes == 0) {
        if (seconds == 1) {
            return "1 second ago"
        } else {
            return seconds + " seconds ago"
        }
    } else if (minutes == 1) {
        if (seconds == 0) {
            return "1 minute ago"
        }
        else if (seconds == 1) {
            return "1 minute, 1 second ago"
        } else {
            return "1 minute, " + seconds + " seconds ago"
        }
    } else {
        if (seconds == 0) {
            return minutes + " minutes ago"
        }
        else if (seconds == 1) {
            return minutes + " minutes, 1 second ago"
        } else {
            return minutes + "minutes, " + seconds + " seconds ago"
        }
    }
}