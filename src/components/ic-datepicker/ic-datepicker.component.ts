import {
  Component, ElementRef, EventEmitter, HostListener, Inject, Input, OnChanges, OnDestroy, OnInit, Output,
  Renderer, SimpleChanges, forwardRef, TemplateRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import moment from 'moment';

import { IcDatepickerDay } from '../../interfaces/ic-datepicker-day';
import { IcDatepickerOptionsInterface } from '../../interfaces/ic-datepicker-options';
import { IcDatepickerOptions } from '../../models/ic-datepicker-options';
import { IcDatepickerYear } from '../../interfaces/ic-datepicker-year';
import { IcDatepickerService } from '../../services/ic-datepicker.service';

@Component({
  selector: 'ic-datepicker',
  templateUrl: './ic-datepicker.component.html',
  styleUrls: [
    './ic-datepicker.component.scss'
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IcDatepickerComponent),
      multi: true
    }
  ],
})
export class IcDatepickerComponent implements ControlValueAccessor, OnChanges, OnDestroy, OnInit {
  @Input() inputTemplate: TemplateRef<any>;
  @Input() options: IcDatepickerOptionsInterface = {};
  @Output() dateChange = new EventEmitter();
  @Output() monthChange = new EventEmitter();
  @Output() opened = new EventEmitter();
  @Output() closed = new EventEmitter();

  currentPeriod: moment.Moment;
  datepickerIsOpen: boolean;
  dayLabels: string[];
  documentClickEvent: Function;
  initialised = false;
  isDisabled = false;
  mergedOptions: IcDatepickerOptions;
  nextMonthToggleActive: boolean;
  periodDays: IcDatepickerDay[];
  previousMonthToggleActive: boolean;
  yearSelectMode: boolean;
  yearOptions: IcDatepickerYear[];

  // Context variables provided to custom input templates
  templateContext = {
    getInputValue: () => {
      return this.getInputValue();
    }
  };

  // Control Value Accessor setup
  selectedDay: IcDatepickerDay | null;
  propagateTouch: () => void = () => { };
  propagateChange: (_: any) => void = () => { };

  /**
   * IcDatepickerComponent Constructor
   *
   * @param icDatepickerService
   * @param renderer
   * @param element
   */
  constructor(
    @Inject(IcDatepickerService) private icDatepickerService: IcDatepickerService,
    @Inject(Renderer) private renderer: Renderer,
    @Inject(ElementRef) private element: ElementRef
  ) { }

  /**
   * On Component init
   */
  ngOnInit() {
    this.mergedOptions = new IcDatepickerOptions(this.options, this.icDatepickerService);

    // @todo: calculate whether the selected month should display based on min/max dates. Set the initial view appropriately

    this.selectedDay = null;
    this.setCurrentPeriod(moment());
    this.datepickerIsOpen = false;
    this.dayLabels = this.icDatepickerService.buildDayLabels();
    this.yearSelectMode = this.mergedOptions.defaultToYearSelect;
    this.yearOptions = this.buildYearOptions();
    this.toggleMonthToggles(this.currentPeriod);

    this.documentClickEvent = this.renderer.listenGlobal('document', 'click', (event: MouseEvent) => {
      event.stopPropagation();

      let closeDatepicker = true;
      let isTarget = this.element.nativeElement === event.target;
      let containsTarget = this.element.nativeElement.contains(event.target);

      if (!event.target || isTarget || containsTarget) {
        closeDatepicker = false;
      }

      if (closeDatepicker) {
        this.closeDatepicker();
      }
    });

    this.initialised = true;
  }

  /**
   * On @Input() changes
   *
   * @param changes
   */
  ngOnChanges(changes: SimpleChanges) {
    if (this.initialised) {
      this.mergedOptions = new IcDatepickerOptions(changes['options'].currentValue, this.icDatepickerService);
      this.setCurrentPeriod(this.currentPeriod);

      if (this.selectedDay) {
        this.selectedDay = this.icDatepickerService.buildDatepickerDay(
          this.selectedDay.moment,
          this.mergedOptions,
          this.selectedDay.moment
        );

        this.emitModelChange(this.selectedDay);
      }

      this.toggleMonthToggles(this.currentPeriod);
    }
  }

  /**
   * On Component destroy
   */
  ngOnDestroy() {
    // Remove the body click event to prevent memory leaks
    if (this.documentClickEvent) {
      this.documentClickEvent();
    }
  }

  /**
   * Keyboard events
   *
   * @param event
   * @returns {boolean}
   */
  @HostListener('window:keydown', ['$event'])
  onKeyboardInput(event: KeyboardEvent) {
    let month: moment.Moment;

    // Only allow keyboard navigation if the datepicker popup is open
    if (!this.datepickerIsOpen) {
      return;
    }

    switch (event.keyCode) {
      // Esc
      case 27:
        this.closeDatepicker();
        break;

      // Left
      case 37:
        month = this.currentPeriod.clone().subtract(1, 'month');

        if (this.monthIsValid(month)) {
          this.showMonth('previous');
        }

        break;

      // Right
      case 39:
        month = this.currentPeriod.clone().add(1, 'month');

        if (this.monthIsValid(month)) {
          this.showMonth('next');
        }

        break;
    }
  }

  /**
   * Update the selected day when the model value is changed externally
   *
   * @param value
   */
  writeValue(value: any) {
    if (!value) {
      this.selectedDay = null;
      return;
    }

    if (value !== this.selectedDay) {
      if ('string' === typeof value) {
        value = moment(value, this.mergedOptions.stringModelFormat);
      }

      if (value.isValid()) {
        let selectedMoment = this.selectedDay ? this.selectedDay.moment : null;
        value = this.icDatepickerService.buildDatepickerDay(value, this.mergedOptions, selectedMoment);
      } else {
        console.warn(`Invalid model value ${value} provided to the IcDatepickerComponent`);
        return false;
      }

      let isValid = true;

      if (this.mergedOptions.minDate && value.moment.isBefore(this.mergedOptions.minDate)) {
        isValid = false;
      }

      if (isValid) {
        if (this.mergedOptions.maxDate && value.moment.isAfter(this.mergedOptions.maxDate)) {
          isValid = false;
        }
      }

      if (!isValid) {
        console.warn('Initial date falls beyond the configured minimum/maximum date');

        if (this.mergedOptions.clearInvalidDates) {
          this.selectedDay = null;
          setTimeout(() => {
            this.emitModelChange(null);
          });
        }

        return false;
      }

      this.selectedDay = value;
      this.setCurrentPeriod(value.moment);
      this.toggleMonthToggles(value.moment);

      if (!isValid) {
        console.warn('Date falls beyond the configured minimum/maximum date');
        return false;
      }
    }
  }

  /**
   * Register an On Change callback
   *
   * @param fn
   */
  registerOnChange(fn: any): void {
    this.propagateChange = fn;
  }

  /**
   * Register an On Touch callback
   *
   * @param fn
   */
  registerOnTouched(fn: any): void {
    this.propagateTouch = fn;
  }

  /**
   * Toggle the disabled state of the component
   *
   * @param isDisabled
   */
  setDisabledState(isDisabled: boolean) {
    this.isDisabled = isDisabled;
  }

  /**
   * Returns the value for display in the input field
   *
   * @returns {string}
   */
  getInputValue() {
    let value = '';

    if (this.selectedDay && this.selectedDay.formattedDate) {
      value = this.selectedDay.formattedDate;
    }

    return value;
  }

  /**
   * Toggles the open state of the datepicker
   */
  toggleDatepicker() {
    this.datepickerIsOpen = !this.datepickerIsOpen;

    let event = this.datepickerIsOpen ? this.opened : this.closed;

    event.emit();
  }

  /**
   * Closes the Datepicker
   */
  closeDatepicker() {
    this.datepickerIsOpen = false;

    this.closed.emit();
  }

  /**
   * Toggles the displayed month
   *
   * @param direction
   */
  showMonth(direction: 'next' | 'previous') {
    let originalValue = this.currentPeriod.clone();
    let updatedPeriod: moment.Moment;

    if ('next' === direction) {
      updatedPeriod = this.currentPeriod.clone().add(1, 'month');
    } else {
      updatedPeriod = this.currentPeriod.clone().subtract(1, 'month');
    }

    this.setCurrentPeriod(updatedPeriod);
    this.toggleMonthToggles(updatedPeriod);

    this.monthChange.emit({
      previous: originalValue.startOf('month'),
      value: updatedPeriod.clone().startOf('month')
    });
  }

  /**
   *
   * @param direction
   */
  showYears(direction: 'next' | 'previous') {
    let currentLastYear: moment.Moment;

    if ('next' === direction) {
      currentLastYear = this.yearOptions[this.yearOptions.length - 1].moment.add(1, 'year');
    } else {
      currentLastYear = this.yearOptions[0].moment.subtract(25, 'years');
    }

    this.yearOptions = this.buildYearOptions(currentLastYear);
  }

  /**
   * Shows the Year selection panel
   */
  showYearSelectMode() {
    this.yearOptions = this.buildYearOptions();
    this.yearSelectMode = true;
  }

  /**
   * Hides the Year selection panel
   */
  hideYearSelectMode() {
    this.yearSelectMode = false;
  }

  /**
   * Sets the internally tracked selected day to equal the provided day
   *
   * @param day
   * @param $event
   * @returns {boolean}
   */
  setSelectedDay(day: IcDatepickerDay, $event?: MouseEvent) {
    if ($event) {
      $event.preventDefault();
      $event.stopPropagation();
    }

    if (this.isDisabled || day.isPlaceholder || day.isDisabled) {
      return false;
    }

    if (this.selectedDay && this.selectedDay.moment && day.moment && day.moment.isSame(this.selectedDay.moment)) {
      return false;
    }

    if (!this.icDatepickerService.dateIsValid(day.moment, this.mergedOptions)) {
      return false;
    }

    this.selectedDay = day;

    if (day.moment) {
      this.setCurrentPeriod(day.moment);
    }

    if (this.mergedOptions.closeOnSelect) {
      this.closeDatepicker();
    }

    this.emitModelChange(day);
  }

  /**
   *
   * @param year
   */
  setSelectedYear(year: IcDatepickerYear) {
    let newDate = this.currentPeriod.format('DD/MM') + '/' + year.moment.format('YYYY');
    let newDateMoment = moment(newDate, 'DD/MM/YYYY');

    if (moment.isMoment(this.mergedOptions.minDate) && newDateMoment.isBefore(this.mergedOptions.minDate)) {
      newDateMoment = this.mergedOptions.minDate.clone();
    } else if (moment.isMoment(this.mergedOptions.maxDate) && newDateMoment.isAfter(this.mergedOptions.maxDate)) {
      newDateMoment = this.mergedOptions.maxDate.clone();
    }

    this.setCurrentPeriod(newDateMoment);
    this.hideYearSelectMode();

    /*
     Timeout is required to prevent the datepicker from closing when clicking a year due to
     the year element from no longer existing at the point when the element.contains() check
     is evaluated.
     */
    setTimeout(() => {
      this.yearOptions = this.buildYearOptions();
    });
  }

  /**
   * Enables or disables the next/previous month toggles based on any provided min or max dates
   *
   * @param updatedPeriod
   */
  private toggleMonthToggles(updatedPeriod: moment.Moment) {
    this.previousMonthToggleActive = this.monthIsValid(updatedPeriod.clone().subtract(1, 'month'));
    this.nextMonthToggleActive = this.monthIsValid(updatedPeriod.clone().add(1, 'month'));
  }

  /**
   * Returns whether the provided month is valid based on optionally provided min/max dates
   *
   * @param month
   * @returns {boolean}
   */
  private monthIsValid(month: moment.Moment): boolean {
    let valid = true;

    if (moment.isMoment(this.mergedOptions.minDate)) {
      valid = month.clone()
        .endOf('month')
        .isSameOrAfter(
          this.mergedOptions
            .minDate
            .clone()
            .startOf('month')
        );
    }

    if (valid && moment.isMoment(this.mergedOptions.maxDate)) {
      valid = month.clone()
        .startOf('month')
        .isSameOrBefore(
          this.mergedOptions
            .maxDate
            .clone()
            .startOf('month')
        );
    }

    return valid;
  }

  /**
   * Sets the currently rendered month period and generates the Day collection within that period
   *
   * @param momentInstance
   */
  private setCurrentPeriod(momentInstance: moment.Moment) {
    let selectedDay: moment.Moment | null = null;

    if (this.selectedDay && this.selectedDay.moment) {
      selectedDay = this.selectedDay.moment;
    }

    this.currentPeriod = momentInstance;
    this.periodDays = this.icDatepickerService.buildCalendarMonth(
      this.currentPeriod.clone(),
      this.mergedOptions,
      selectedDay
    );
    this.toggleMonthToggles(this.currentPeriod);
  }

  /**
   * Builds the list of Year options for the Year select panel
   *
   * @param year
   * @returns {IcDatepickerYear[]}
   */
  private buildYearOptions(
    year: moment.Moment = this.currentPeriod.clone().subtract(12, 'years')
  ) {
    let years: IcDatepickerYear[] = [];
    let end = year.clone().add(25, 'years');

    while (year.isBefore(end)) {
      let isDisabled = false;
      let minDate = this.mergedOptions.minDate;
      let maxDate = this.mergedOptions.maxDate;

      if (
        (minDate && year.isBefore(minDate, 'year')) ||
        (maxDate && year.isAfter(maxDate, 'year'))
      ) {
        isDisabled = true;
      }

      years.push({
        formatted: year.format('YYYY'),
        isDisabled: isDisabled,
        isSelected: year.isSame(this.currentPeriod, 'year'),
        isThisYear: year.isSame(moment(), 'year'),
        moment: year.clone()
      });

      year.add(1, 'year');
    }

    return years;
  }

  /**
   * Emits a model change
   *
   * @param day
   */
  private emitModelChange(day: IcDatepickerDay | null) {
    let originalValue: any;
    let updatedValue: any = day;

    switch (this.mergedOptions.modelType) {
      case 'moment':
        originalValue = this.selectedDay ? this.selectedDay.moment : null;

        if (day) {
          updatedValue = day.moment;
        }

        break;

      case 'IcDatepickerDay':
        originalValue = this.selectedDay;

        if (day) {
          updatedValue = day;
        }

        break;

      case 'date':
        originalValue = this.selectedDay ? this.selectedDay.moment.toDate() : null;

        if (day) {
          updatedValue = day.moment.toDate();
        }

        break;

      case 'string':
        originalValue = this.selectedDay ? this.selectedDay.moment.format(this.mergedOptions.stringModelFormat) : null;

        if (day) {
          updatedValue = day.moment.format(this.mergedOptions.stringModelFormat);
        }

        break;
    }

    // Inform change listeners of the change
    this.propagateChange(updatedValue);
    this.dateChange.emit({
      previous: originalValue,
      value: updatedValue
    });
  }
}
