(function ($) {
	'use strict';
	$.fn.dateTimePicker = function (options) {

		var settings = $.extend({
			selectData: 'now',
			dateFormat: 'YYYY-MM-DD HH:mm',
			showTime: true,
			locale: 'en',
			title: 'Select Date and Time',
			buttonTitle: 'Select',
			allowBackwards: true
		}, options);
		moment.locale(settings.locale);
		var elem = this;
		var limitation = {'hour': 23, 'minute': 59};
		var mousedown = false;
		var timeout = 400;
		var selectDate = settings.selectData == 'now' ? moment() : moment(settings.selectData, settings.dateFormat);
		if (selectDate < moment() && settings.allowBackwards == false) {
			selectDate = moment();
		}
		var startDate = copyDate(moment());
		var lastSelected = copyDate(selectDate);
		return this.each(function () {
			if (lastSelected != selectDate) {
				selectDate = copyDate(lastSelected);
			}
			elem.addClass('dtp_main');
			updateMainElemGlobal();
			
			function updateMainElemGlobal() {
				var arrF = settings.dateFormat.split(' ');
				if (settings.showTime && arrF.length != 2) {
					arrF.length = 2;
					arrF[0] = 'DD/MM/YY';
					arrF[1] = 'HH:mm';
				}
				elem.empty();
				let html = `<span class="pickerText"><span>${lastSelected.format(arrF[0])}</span><i class="fa fa-calendar ico-size"></i>`;
				if (settings.showTime) {
					html += `<span>${lastSelected.format(arrF[1])}</span><i class="fa fa-clock-o ico-size"></i>`;
				}
				const time = Math.floor(new Date(selectDate).getTime() / 1000);
				elem.next().val(time);
				elem.append(html);
			}

			elem.on('click', function() {
				const $body = $('body');

				if ($body.children('.dtp_modal-content').length > 0) return;

				const $content = createContent();

				$body.append($content);

				feelDates(selectDate);

				$(document).on('click', function(e) {
					if ($(e.target).closest('.dtp_modal-content').length === 0 && !$(e.target).is('.dtp_main')) {
						$content.remove();
					}
				});

				if (settings.showTime) {
					attachChangeTime();
					var $fieldTime = $('#field-time');
					var $hour = $fieldTime.find('#d-hh');
					var $minute = $fieldTime.find('#d-mm');
				}

				function feelDates(selectM) {
					const $fDate = $content.find('#field-data');
					$fDate.empty();
					$fDate.append(createMonthPanel(selectM));
					$fDate.append(createCalendar(selectM));
				}

				function createCalendar(selectedMonth) {
					var $c = $('<div>');
					$c.addClass('dtp_modal-calendar');
					for (let i = 0; i < 7; i++) {
						var $e = $('<div>');
						$e.addClass('dtp_modal-calendar-cell dtp_modal-colored');
						$e.text(moment().weekday(i).format('ddd'));
						$c.append($e);
					}
					var m = copyDate(selectedMonth);
					m.date(1);
					var flagStart = totalMonths(selectedMonth) === totalMonths(startDate);
					var flagSelect = totalMonths(lastSelected) === totalMonths(selectedMonth);
					var cerDay = parseInt(selectedMonth.format('D'));
					var dayNow = parseInt(startDate.format('D'));
					for (let i = 0; i < 6; i++) {
						for (var j = 0; j < 7; j++) {
							var $b = $('<div>');
							$b.addClass('dtp_modal-calendar-cell');
							if (m.month() == selectedMonth.month() && m.weekday() == j) {
								var day = parseInt(m.format('D'));
								$b.text(day);
								if (flagStart && day < dayNow) {
									if (! (settings.allowBackwards)) {
										$b.addClass('dtp_modal-grey');
									} else {
										$b.addClass('cursorily');
										$b.bind('click', changeDate);
									}
								}
								else if (flagSelect && day == cerDay) {
									$b.addClass('dtp_modal-cell-selected');
								}
								else {
									$b.addClass('cursorily');
									$b.bind('click', changeDate);
								}
								m.add(1, 'days');
							}
							$c.append($b);
						}
					}
					return $c;
				}

				function changeDate() {

					var $div = $(this);
					selectDate.date($div.text());
					lastSelected = copyDate(selectDate);
					updateDate();
					var $fDate = $content.find('#field-data');
					var old = $fDate.find('.dtp_modal-cell-selected');
					old.removeClass('dtp_modal-cell-selected');
					old.addClass('cursorily');
					$div.addClass('dtp_modal-cell-selected');
					$div.removeClass('cursorily');
					old.bind('click', changeDate);
					$div.unbind('click');
					// console.log(selectDate.format('DD-MM-YYYY'));
				}

				function createMonthPanel(selectMonth) {
					const $cont = $('<div class="dtp_modal-months"></div>');
					const $prev = $('<i class="fa fa-angle-left cursorily ico-size-month hov"></i>');
					const $month = $(`<span>${selectMonth.format('MMMM YYYY')}</span>`);
					const $next = $('<i class="fa fa-angle-right cursorily ico-size-month hov"></i>');
					
					$prev.on('click', prevMonth);
					$next.on('click', nextMonth);

					$cont.append($prev);
					$cont.append($month);
					$cont.append($next);
					return $cont;
				}

				function close(e) {
					e.stopPropagation();
					if (settings.showTime) {
						lastSelected.hour(parseInt($hour.text()));
						lastSelected.minute(parseInt($minute.text()));
						selectDate.hour(parseInt($hour.text()));
						selectDate.minute(parseInt($minute.text()));
					}
					updateDate();
					$content.remove();
				}

				function nextMonth(e) {
					e.stopPropagation();
					selectDate.add(1, 'month');
					feelDates(selectDate);
				}

				function prevMonth(e) {
					e.stopPropagation();
					if (totalMonths(selectDate) > totalMonths(startDate) || settings.allowBackwards == true) {
						selectDate.add(-1, 'month');
						feelDates(selectDate);
					}
				}

				function attachChangeTime() {
					var $angles = $($content).find('i[id^="angle-"]');
					$angles.bind('mouseup', function () {
						mousedown = false;
						timeout = 400;
					});
					$angles.bind('mousedown', function () {
						mousedown = true;
						changeTime(this);
					});
				}

				function changeTime(el) {
					var $el = this || el;
					$el = $($el);
					///angle-up-hour angle-up-minute angle-down-hour angle-down-minute
					var arr = $el.attr('id').split('-');
					var increment = 1;
					if (arr[1] == 'down') {
						increment = -1;
					}
					appendIncrement(arr[2], increment);
					setTimeout(function () {
						autoIncrement($el);
					}, timeout);
				}

				function autoIncrement(el) {
					if (mousedown) {
						if (timeout > 100) {
							timeout -= 100;
						}
						changeTime(el);
					}
				}

				function appendIncrement(typeDigits, increment) {

					var $i = typeDigits == 'hour' ? $hour : $minute;
					var val = parseInt($i.text()) + increment;
					if (val < 0) {
						val = limitation[typeDigits];
					}
					else if (val > limitation[typeDigits]) {
						val = 0;
					}
					$i.text(formatDigits(val));
				}

				function formatDigits(val) {

					if (val < 10) {
						return '0' + val;
					}
					return val;
				}

				function createTimer() {
					const timeSelect = `<div class="dtp_modal-time-mechanic">
						<i id="angle-up-hour" class="timerArrowTL fa fa-angle-up ico-size-large cursorily hov"></i>
						<i id="angle-up-minute" class="timerArrowTR fa fa-angle-up ico-size-large cursorily hov"></i>

						<span class="timerTimeML" id="d-hh">${lastSelected.format('HH')}</span>
						<span class="timerTimeMM">:</span>
						<span class="timerTimeMR" id="d-mm">${lastSelected.format('mm')}</span>

						<i id="angle-down-hour" class="timerArrowBL fa fa-angle-down ico-size-large cursorily hov"></i>
						<i id="angle-down-minute" class="timerArrowBR fa fa-angle-down ico-size-large cursorily hov"></i>
					</div>`;
					return timeSelect;
				}

				function createContent() {
					var $c = $('<div>');
					if (settings.showTime) {
						$c.addClass('dtp_modal-content bg-dark text-light');
					}
					else {
						$c.addClass('dtp_modal-content-no-time bg-dark text-light');
					}
					var $el = $('<div>');
					$el.addClass('dtp_modal-title');
					$el.text(settings.title);
					$c.append($el);
					$el = $('<div>');
					$el.addClass('dtp_modal-cell-date my-3');
					$el.attr('id', 'field-data');
					$c.append($el);
					if (settings.showTime) {
						$el = $('<div>');
						$el.addClass('dtp_modal-cell-time');
						var $a = $('<div>');
						$a.addClass('dtp_modal-time-block');
						$a.attr('id', 'field-time');
						$el.append($a);
						var $line = $('<div>');
						$line.attr('id', 'time-line');
						$line.addClass('dtp_modal-time-line');
						$line.text(lastSelected.format(settings.dateFormat));

						$a.append($line);
						$a.append(createTimer());
						var $but = $('<div>');
						$but.addClass('btn btn-primary btn-lg');
						$but.text(settings.buttonTitle);
						$but.bind('click', close);
						$el.append($but);
						$c.append($el);
					}
					return $c;
				}
				function updateDate() {
					if (settings.showTime) {
						$('#time-line').text(lastSelected.format(settings.dateFormat));
					}
					updateMainElem();
					const time = Math.floor(new Date(selectDate).getTime() / 1000);
					elem.next().val(time);
					elem.next().trigger('change');
					if (!settings.showTime) {
						$content.remove();
					}
				}

				function updateMainElem() {
					var arrF = settings.dateFormat.split(' ');
					if (settings.showTime && arrF.length != 2) {
						arrF.length = 2;
						arrF[0] = 'DD/MM/YY';
						arrF[1] = 'HH:mm';
					}
					elem.empty();
					let html = `<span class="pickerText"><span>${lastSelected.format(arrF[0])}</span><i class="fa fa-calendar ico-size"></i>`;
					if (settings.showTime) {
						html += `<span>${lastSelected.format(arrF[1])}</span><i class="fa fa-clock-o ico-size"></i>`;
					}
					elem.append(html);
				}

			});

		});

	};

	function copyDate(d) {
		return moment(d.toDate());
	}

	function totalMonths(m) {
		var r = m.format('YYYY') * 12 + parseInt(m.format('MM'));
		return r;
	}

}(jQuery));