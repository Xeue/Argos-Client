let server = window.location;

let editors = {};

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
let lastBroken = true;
let lastTra = -1;
let lastAlive = -1;
let lastMac = -1;
let lastPhy = -1;
let lastUps = -1;
let lastUpsHash = "";

let templates = {};

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

templates.devices = `<% for(i = 0; i < devices.length; i++) { %>
  <tr data-index="<%=i%>" data-template="devices">
    <td data-type="text" data-key="name" data-value="<%-devices[i].name%>"><%-devices[i].name%></td>
    <td data-type="range" data-key-from="start" data-key-to="end" data-from="<%-devices[i].start%>" data-to="<%-devices[i].end%>"><%-devices[i].start%> to <%-devices[i].end%></td>
    <td data-type="text" data-key="description" data-value="<%-devices[i].description%>"><%-devices[i].description%></td>
    <td>
      <button type="button" class="btn btn-danger editConfig w-50">Edit</button>
      <button type="button" class="btn btn-danger deleteRow w-50">Delete</button>
    </td>
  </tr>
<% } %>`;

function socketDoOpen() {
  console.log("Registering as client");
  sendData({"command":"register"});
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

function getFibre() {
    $.getJSON(`${server}fibre`, function (data) {
        $('table#tra tbody').empty()
        if (Object.keys(data).length == 0) {
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

function getMac() {
    $.getJSON(`${server}mac`, function (data) {
        $('table#mac tbody').empty()
        if (Object.keys(data).length == 0) {
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

function getPhy() {
    $.getJSON(`${server}phy`, function (data) {
        $('table#phy tbody').empty()
        if (Object.keys(data).length == 0) {
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

function getUps() {
    $.getJSON(`${server}ups`, function (data) {
        let hash = CryptoJS.MD5(JSON.stringify(data)).toString()
        if (lastUpsHash !== "" && hash !== lastUpsHash) {
            if (Object.keys(data).length > 0) {
                saySomething("you pee ess broken")
            }
        } else if (lastUpsHash === "" && data.length > 0) {
            saySomething("you pee ess broken")
        }
        lastUpsHash = hash

        $('table#ups tbody').empty()
        if (Object.keys(data).length == 0) {
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

function loading(state) {
  if (state) {
    $("#loading").removeClass("hidden");
  } else {
    $("#loading").addClass("hidden");
  }
}

$(document).ready(function() {
  socketConnect("Browser");
  updateTempchart("7200");
  updatePingChart("7200");
  renderPingChart(pings);
  renderBootChart(boots);
  renderTempChart(f,m,b,a);
  getBroken();
  getDevices();
  getMac();
  getPhy();
  getUps();
  getFibre();
  setInterval(updateLast, 1000);
  $('#webBroken').html(`<span class="badge badge-pill bg-danger">Website Broken</span>`);

  $(document).click(function(e) {
    $trg = $(e.target);
    if ($trg.hasClass("tempBut")) {
      let time = parseInt($trg.data("time"));
      updateTempchart(time);
    } else if ($trg.hasClass("pingBut")) {
      let time = parseInt($trg.data("time"));
      updatePingChart(time);
    } else if ($trg.is("#toggleConfig")) {
      $trg.toggleClass("rotate");
      loading(true);
      let promises = [
        getConfig("switches"),
        getConfig("devices"),
        getConfig("ups"),
        getConfig("frames")
      ]
      Promise.allSettled(promises).then(values => {
        loading(false);
        $("#config").toggleClass("hidden");

        editors["switches"] = renderEditorTab(values[0].value, editors["switches"], templates.nameIP, "configSwitches");
        editors["devices"] = renderEditorTab(values[1].value, editors["devices"], templates.devices, "configDevices");
        editors["ups"] = renderEditorTab(values[2].value, editors["ups"], templates.nameIP, "configUps");
        editors["frames"] = renderEditorTab(values[3].value, editors["frames"], templates.nameIP, "configFrames");
      }).catch(error => {
        console.log(error);
      })

    } else if ($trg.hasClass("toggleTableRaw")) {
      $trg.closest(".tab-pane").find(".dataTable").collapse("toggle");
      $trg.closest(".tab-pane").find(".dataRaw").collapse("toggle");
      if ($trg.data("mode") == "table") {
        $trg.html("Show Table");
        $trg.data("mode", "raw");
      } else {
        $trg.html("Show Raw");
        $trg.data("mode", "table");
      }
    } else if ($trg.hasClass("editConfig")) {
      let $row = $trg.closest("tr");
      $row.children().each(function() {
        let $td = $(this);
        switch ($td.data("type")) {
          case "text":
            let $txt = $(`<input type="text" class="form-control" value="${$td.data("value")}" name="${$td.data("key")}"></input>`);
            $txt.change(function() {
              $td.data("value", $txt.val())
            });
            $td.html("");
            $td.append($txt);
            break;
          case "range":
            let $from = $(`<input type="text" class="editRange form-control text-end" value="${$td.data("from")}" name="${$td.data("key-from")}"></input>`);
            let $to = $(`<input type="text" class="editRange form-control" value="${$td.data("to")}" name="${$td.data("key-to")}"></input>`);
            $from.change(function() {
              $td.data("from", $from.val())
            });
            $to.change(function() {
              $td.data("to", $to.val())
            });
            $td.html("");
            $td.addClass("input-group");
            $td.append($from);
            $td.append('<span class="input-group-text">to</span>');
            $td.append($to);
            break;
          default:
            break;
        }
        $trg.html("Done");
        $trg.removeClass("editConfig");
        $trg.removeClass("btn-danger");
        $trg.addClass("doneConfig");
        $trg.addClass("btn-success");
      })
    } else if ($trg.hasClass("doneConfig")) {
      let $row = $trg.closest("tr");
      let data = {};
      $row.children().each(function() {
        let $td = $(this);
        switch ($td.data("type")) {
          case "text":
            $td.html($td.data("value"));
            data[$td.data("key")] = $td.data("value");
            break;
          case "range":
            $td.html(`${$td.data("from")} to ${$td.data("to")}`);
            data[$td.data("key-from")] = parseInt($td.data("from"));
            data[$td.data("key-to")] = parseInt($td.data("to"));
            $td.removeClass("input-group");
            break;
          default:
            break;
        }
        $trg.html("Edit");
        $trg.addClass("editConfig");
        $trg.addClass("btn-danger");
        $trg.removeClass("doneConfig");
        $trg.removeClass("btn-success");
      })
      let editor = $row.closest("table").data("editor");
      let current = editors[editor].get();
      current[$row.data("index")] = data;
      editors[editor].set(current);
      editors[editor].expandAll();
    } else if ($trg.hasClass("tableNew")) {
      let $tbody = $trg.closest(".tab-pane").find(".dataTable").find("tbody");
      let $rows = $tbody.children();
      let template = $rows.last().data("template");
      
      let dummyData = [];
      dummyData[0] = {};
      switch (template) {
        case "nameIP":
          dummyData[0].Name = "New Device";
          dummyData[0].IP = "IP Address";
          break;
        case "devices":
          dummyData[0].name = "New Device";
          dummyData[0].start = 1;
          dummyData[0].end = 1;
          dummyData[0].description = "Description";
          break;
        default:
          break;
      }
      let $new = $(ejs.render(templates[template], {devices: dummyData}));
      let index = $rows.length;
      $new.data("index", index);
      $tbody.append($new);
      $new.find(".editConfig").trigger("click");
    } else if ($trg.hasClass("tableSave")) {
      let $tbody = $trg.closest(".tab-pane").find(".dataTable").find("table");
      let editor = $tbody.data("editor");
      let current = editors[editor].get();
      $.ajax(`${server}set${editor}`, {
        data : JSON.stringify(current),
        contentType : 'application/json',
        type : 'POST'}
      ).then(function(data) {
        alert("Saved");
      })
    } else if ($trg.hasClass("deleteRow")) {
      let $row = $trg.closest("tr");
      let editor = $row.closest("table").data("editor");
      let current = editors[editor].get();
      current.splice($row.data("index"), 1);
      editors[editor].set(current);
      editors[editor].expandAll();
      $row.remove();
    }
  });

  $('button#cut').on('click', () => {
    let audio = new Audio('media/cut.ogg')
    audio.play()
  })

});

function getConfig(catagory) {
  return $.getJSON(`${server}getConfig?catagory=${catagory}`);
}

function renderEditorTab(devicesData, editor, template, element) {
  if (!editor) {
    const container = document.getElementById(`${element}Raw`);
    let options = {
      "onChange": function(changed) {
        $(`#${element}`).html(ejs.render(template, {devices: editor.get()}));
      },
      "mode": "tree",
      "mainMenuBar": false,
      "navigationBar": false
    }
    editor = new JSONEditor(container, options);
    editor.set(devicesData);
    editor.expandAll();
  }
  $(`#${element}`).html(ejs.render(template, {devices: devicesData}));
  return editor;
}