(() => {
var _window$dateFns;function _typeof(o) {"@babel/helpers - typeof";return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) {return typeof o;} : function (o) {return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;}, _typeof(o);}function ownKeys(e, r) {var t = Object.keys(e);if (Object.getOwnPropertySymbols) {var o = Object.getOwnPropertySymbols(e);r && (o = o.filter(function (r) {return Object.getOwnPropertyDescriptor(e, r).enumerable;})), t.push.apply(t, o);}return t;}function _objectSpread(e) {for (var r = 1; r < arguments.length; r++) {var t = null != arguments[r] ? arguments[r] : {};r % 2 ? ownKeys(Object(t), !0).forEach(function (r) {_defineProperty(e, r, t[r]);}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) {Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));});}return e;}function _defineProperty(e, r, t) {return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e;}function _toPropertyKey(t) {var i = _toPrimitive(t, "string");return "symbol" == _typeof(i) ? i : i + "";}function _toPrimitive(t, r) {if ("object" != _typeof(t) || !t) return t;var e = t[Symbol.toPrimitive];if (void 0 !== e) {var i = e.call(t, r || "default");if ("object" != _typeof(i)) return i;throw new TypeError("@@toPrimitive must return a primitive value.");}return ("string" === r ? String : Number)(t);}var __defProp = Object.defineProperty;
var __returnValue = function __returnValue(v) {return v;};
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = function __export(target, all) {
  for (var name in all)
  __defProp(target, name, {
    get: all[name],
    enumerable: true,
    configurable: true,
    set: __exportSetter.bind(all, name)
  });
};

// dist/locale/ka/_lib/formatDistance.js
var formatDistanceLocale = {
  lessThanXSeconds: {
    past: "{{count}} წამზე ნაკლები ხნის წინ",
    present: "{{count}} წამზე ნაკლები",
    future: "{{count}} წამზე ნაკლებში"
  },
  xSeconds: {
    past: "{{count}} წამის წინ",
    present: "{{count}} წამი",
    future: "{{count}} წამში"
  },
  halfAMinute: {
    past: "ნახევარი წუთის წინ",
    present: "ნახევარი წუთი",
    future: "ნახევარი წუთში"
  },
  lessThanXMinutes: {
    past: "{{count}} წუთზე ნაკლები ხნის წინ",
    present: "{{count}} წუთზე ნაკლები",
    future: "{{count}} წუთზე ნაკლებში"
  },
  xMinutes: {
    past: "{{count}} წუთის წინ",
    present: "{{count}} წუთი",
    future: "{{count}} წუთში"
  },
  aboutXHours: {
    past: "დაახლოებით {{count}} საათის წინ",
    present: "დაახლოებით {{count}} საათი",
    future: "დაახლოებით {{count}} საათში"
  },
  xHours: {
    past: "{{count}} საათის წინ",
    present: "{{count}} საათი",
    future: "{{count}} საათში"
  },
  xDays: {
    past: "{{count}} დღის წინ",
    present: "{{count}} დღე",
    future: "{{count}} დღეში"
  },
  aboutXWeeks: {
    past: "დაახლოებით {{count}} კვირას წინ",
    present: "დაახლოებით {{count}} კვირა",
    future: "დაახლოებით {{count}} კვირაში"
  },
  xWeeks: {
    past: "{{count}} კვირას კვირა",
    present: "{{count}} კვირა",
    future: "{{count}} კვირაში"
  },
  aboutXMonths: {
    past: "დაახლოებით {{count}} თვის წინ",
    present: "დაახლოებით {{count}} თვე",
    future: "დაახლოებით {{count}} თვეში"
  },
  xMonths: {
    past: "{{count}} თვის წინ",
    present: "{{count}} თვე",
    future: "{{count}} თვეში"
  },
  aboutXYears: {
    past: "დაახლოებით {{count}} წლის წინ",
    present: "დაახლოებით {{count}} წელი",
    future: "დაახლოებით {{count}} წელში"
  },
  xYears: {
    past: "{{count}} წლის წინ",
    present: "{{count}} წელი",
    future: "{{count}} წელში"
  },
  overXYears: {
    past: "{{count}} წელზე მეტი ხნის წინ",
    present: "{{count}} წელზე მეტი",
    future: "{{count}} წელზე მეტი ხნის შემდეგ"
  },
  almostXYears: {
    past: "თითქმის {{count}} წლის წინ",
    present: "თითქმის {{count}} წელი",
    future: "თითქმის {{count}} წელში"
  }
};
var formatDistance = function formatDistance(token, count, options) {
  var result;
  var tokenValue = formatDistanceLocale[token];
  if (typeof tokenValue === "string") {
    result = tokenValue;
  } else if (options !== null && options !== void 0 && options.addSuffix && options.comparison && options.comparison > 0) {
    result = tokenValue.future.replace("{{count}}", String(count));
  } else if (options !== null && options !== void 0 && options.addSuffix) {
    result = tokenValue.past.replace("{{count}}", String(count));
  } else {
    result = tokenValue.present.replace("{{count}}", String(count));
  }
  return result;
};

// dist/locale/_lib/buildFormatLongFn.js
function buildFormatLongFn(args) {
  return function () {var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var width = options.width ? String(options.width) : args.defaultWidth;
    var format = args.formats[width] || args.formats[args.defaultWidth];
    return format;
  };
}

// dist/locale/ka/_lib/formatLong.js
var dateFormats = {
  full: "EEEE, do MMMM, y",
  long: "do, MMMM, y",
  medium: "d, MMM, y",
  short: "dd/MM/yyyy"
};
var timeFormats = {
  full: "h:mm:ss a zzzz",
  long: "h:mm:ss a z",
  medium: "h:mm:ss a",
  short: "h:mm a"
};
var dateTimeFormats = {
  full: "{{date}} {{time}}'-ზე'",
  long: "{{date}} {{time}}'-ზე'",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
};
var formatLong = {
  date: buildFormatLongFn({
    formats: dateFormats,
    defaultWidth: "full"
  }),
  time: buildFormatLongFn({
    formats: timeFormats,
    defaultWidth: "full"
  }),
  dateTime: buildFormatLongFn({
    formats: dateTimeFormats,
    defaultWidth: "full"
  })
};

// dist/locale/ka/_lib/formatRelative.js
var formatRelativeLocale = {
  lastWeek: "'წინა' eeee p'-ზე'",
  yesterday: "'გუშინ' p'-ზე'",
  today: "'დღეს' p'-ზე'",
  tomorrow: "'ხვალ' p'-ზე'",
  nextWeek: "'შემდეგი' eeee p'-ზე'",
  other: "P"
};
var formatRelative = function formatRelative(token, _date, _baseDate, _options) {return formatRelativeLocale[token];};

// dist/locale/_lib/buildLocalizeFn.js
function buildLocalizeFn(args) {
  return function (value, options) {
    var context = options !== null && options !== void 0 && options.context ? String(options.context) : "standalone";
    var valuesArray;
    if (context === "formatting" && args.formattingValues) {
      var defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
      var width = options !== null && options !== void 0 && options.width ? String(options.width) : defaultWidth;
      valuesArray = args.formattingValues[width] || args.formattingValues[defaultWidth];
    } else {
      var _defaultWidth = args.defaultWidth;
      var _width = options !== null && options !== void 0 && options.width ? String(options.width) : args.defaultWidth;
      valuesArray = args.values[_width] || args.values[_defaultWidth];
    }
    var index = args.argumentCallback ? args.argumentCallback(value) : value;
    return valuesArray[index];
  };
}

// dist/locale/ka/_lib/localize.js
var eraValues = {
  narrow: ["ჩ.წ-მდე", "ჩ.წ"],
  abbreviated: ["ჩვ.წ-მდე", "ჩვ.წ"],
  wide: ["ჩვენს წელთაღრიცხვამდე", "ჩვენი წელთაღრიცხვით"]
};
var quarterValues = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["1-ლი კვ", "2-ე კვ", "3-ე კვ", "4-ე კვ"],
  wide: ["1-ლი კვარტალი", "2-ე კვარტალი", "3-ე კვარტალი", "4-ე კვარტალი"]
};
var monthValues = {
  narrow: [
  "ია",
  "თე",
  "მა",
  "აპ",
  "მს",
  "ვნ",
  "ვლ",
  "აგ",
  "სე",
  "ოქ",
  "ნო",
  "დე"],

  abbreviated: [
  "იან",
  "თებ",
  "მარ",
  "აპრ",
  "მაი",
  "ივნ",
  "ივლ",
  "აგვ",
  "სექ",
  "ოქტ",
  "ნოე",
  "დეკ"],

  wide: [
  "იანვარი",
  "თებერვალი",
  "მარტი",
  "აპრილი",
  "მაისი",
  "ივნისი",
  "ივლისი",
  "აგვისტო",
  "სექტემბერი",
  "ოქტომბერი",
  "ნოემბერი",
  "დეკემბერი"]

};
var dayValues = {
  narrow: ["კვ", "ორ", "სა", "ოთ", "ხუ", "პა", "შა"],
  short: ["კვი", "ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ"],
  abbreviated: ["კვი", "ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ"],
  wide: [
  "კვირა",
  "ორშაბათი",
  "სამშაბათი",
  "ოთხშაბათი",
  "ხუთშაბათი",
  "პარასკევი",
  "შაბათი"]

};
var dayPeriodValues = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "შუაღამე",
    noon: "შუადღე",
    morning: "დილა",
    afternoon: "საღამო",
    evening: "საღამო",
    night: "ღამე"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "შუაღამე",
    noon: "შუადღე",
    morning: "დილა",
    afternoon: "საღამო",
    evening: "საღამო",
    night: "ღამე"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "შუაღამე",
    noon: "შუადღე",
    morning: "დილა",
    afternoon: "საღამო",
    evening: "საღამო",
    night: "ღამე"
  }
};
var formattingDayPeriodValues = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "შუაღამით",
    noon: "შუადღისას",
    morning: "დილით",
    afternoon: "ნაშუადღევს",
    evening: "საღამოს",
    night: "ღამით"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "შუაღამით",
    noon: "შუადღისას",
    morning: "დილით",
    afternoon: "ნაშუადღევს",
    evening: "საღამოს",
    night: "ღამით"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "შუაღამით",
    noon: "შუადღისას",
    morning: "დილით",
    afternoon: "ნაშუადღევს",
    evening: "საღამოს",
    night: "ღამით"
  }
};
var ordinalNumber = function ordinalNumber(dirtyNumber) {
  var number = Number(dirtyNumber);
  if (number === 1) {
    return number + "-ლი";
  }
  return number + "-ე";
};
var localize = {
  ordinalNumber: ordinalNumber,
  era: buildLocalizeFn({
    values: eraValues,
    defaultWidth: "wide"
  }),
  quarter: buildLocalizeFn({
    values: quarterValues,
    defaultWidth: "wide",
    argumentCallback: function argumentCallback(quarter) {return quarter - 1;}
  }),
  month: buildLocalizeFn({
    values: monthValues,
    defaultWidth: "wide"
  }),
  day: buildLocalizeFn({
    values: dayValues,
    defaultWidth: "wide"
  }),
  dayPeriod: buildLocalizeFn({
    values: dayPeriodValues,
    defaultWidth: "wide",
    formattingValues: formattingDayPeriodValues,
    defaultFormattingWidth: "wide"
  })
};

// dist/locale/_lib/buildMatchFn.js
function buildMatchFn(args) {
  return function (string) {var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var width = options.width;
    var matchPattern = width && args.matchPatterns[width] || args.matchPatterns[args.defaultMatchWidth];
    var matchResult = string.match(matchPattern);
    if (!matchResult) {
      return null;
    }
    var matchedString = matchResult[0];
    var parsePatterns = width && args.parsePatterns[width] || args.parsePatterns[args.defaultParseWidth];
    var key = Array.isArray(parsePatterns) ? findIndex(parsePatterns, function (pattern) {return pattern.test(matchedString);}) : findKey(parsePatterns, function (pattern) {return pattern.test(matchedString);});
    var value;
    value = args.valueCallback ? args.valueCallback(key) : key;
    value = options.valueCallback ? options.valueCallback(value) : value;
    var rest = string.slice(matchedString.length);
    return { value: value, rest: rest };
  };
}
function findKey(object, predicate) {
  for (var key in object) {
    if (Object.prototype.hasOwnProperty.call(object, key) && predicate(object[key])) {
      return key;
    }
  }
  return;
}
function findIndex(array, predicate) {
  for (var key = 0; key < array.length; key++) {
    if (predicate(array[key])) {
      return key;
    }
  }
  return;
}

// dist/locale/_lib/buildMatchPatternFn.js
function buildMatchPatternFn(args) {
  return function (string) {var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var matchResult = string.match(args.matchPattern);
    if (!matchResult)
    return null;
    var matchedString = matchResult[0];
    var parseResult = string.match(args.parsePattern);
    if (!parseResult)
    return null;
    var value = args.valueCallback ? args.valueCallback(parseResult[0]) : parseResult[0];
    value = options.valueCallback ? options.valueCallback(value) : value;
    var rest = string.slice(matchedString.length);
    return { value: value, rest: rest };
  };
}

// dist/locale/ka/_lib/match.js
var matchOrdinalNumberPattern = /^(\d+)(-ლი|-ე)?/i;
var parseOrdinalNumberPattern = /\d+/i;
var matchEraPatterns = {
  narrow: /^(ჩვ?\.წ)/i,
  abbreviated: /^(ჩვ?\.წ)/i,
  wide: /^(ჩვენს წელთაღრიცხვამდე|ქრისტეშობამდე|ჩვენი წელთაღრიცხვით|ქრისტეშობიდან)/i
};
var parseEraPatterns = {
  any: [
  /^(ჩვენს წელთაღრიცხვამდე|ქრისტეშობამდე)/i,
  /^(ჩვენი წელთაღრიცხვით|ქრისტეშობიდან)/i]

};
var matchQuarterPatterns = {
  narrow: /^[1234]/i,
  abbreviated: /^[1234]-(ლი|ე)? კვ/i,
  wide: /^[1234]-(ლი|ე)? კვარტალი/i
};
var parseQuarterPatterns = {
  any: [/1/i, /2/i, /3/i, /4/i]
};
var matchMonthPatterns = {
  any: /^(ია|თე|მა|აპ|მს|ვნ|ვლ|აგ|სე|ოქ|ნო|დე)/i
};
var parseMonthPatterns = {
  any: [
  /^ია/i,
  /^თ/i,
  /^მარ/i,
  /^აპ/i,
  /^მაი/i,
  /^ი?ვნ/i,
  /^ი?ვლ/i,
  /^აგ/i,
  /^ს/i,
  /^ო/i,
  /^ნ/i,
  /^დ/i]

};
var matchDayPatterns = {
  narrow: /^(კვ|ორ|სა|ოთ|ხუ|პა|შა)/i,
  short: /^(კვი|ორშ|სამ|ოთხ|ხუთ|პარ|შაბ)/i,
  wide: /^(კვირა|ორშაბათი|სამშაბათი|ოთხშაბათი|ხუთშაბათი|პარასკევი|შაბათი)/i
};
var parseDayPatterns = {
  any: [/^კვ/i, /^ორ/i, /^სა/i, /^ოთ/i, /^ხუ/i, /^პა/i, /^შა/i]
};
var matchDayPeriodPatterns = {
  any: /^([ap]\.?\s?m\.?|შუაღ|დილ)/i
};
var parseDayPeriodPatterns = {
  any: {
    am: /^a/i,
    pm: /^p/i,
    midnight: /^შუაღ/i,
    noon: /^შუადღ/i,
    morning: /^დილ/i,
    afternoon: /ნაშუადღევს/i,
    evening: /საღამო/i,
    night: /ღამ/i
  }
};
var match = {
  ordinalNumber: buildMatchPatternFn({
    matchPattern: matchOrdinalNumberPattern,
    parsePattern: parseOrdinalNumberPattern,
    valueCallback: function valueCallback(value) {return parseInt(value, 10);}
  }),
  era: buildMatchFn({
    matchPatterns: matchEraPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseEraPatterns,
    defaultParseWidth: "any"
  }),
  quarter: buildMatchFn({
    matchPatterns: matchQuarterPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseQuarterPatterns,
    defaultParseWidth: "any",
    valueCallback: function valueCallback(index) {return index + 1;}
  }),
  month: buildMatchFn({
    matchPatterns: matchMonthPatterns,
    defaultMatchWidth: "any",
    parsePatterns: parseMonthPatterns,
    defaultParseWidth: "any"
  }),
  day: buildMatchFn({
    matchPatterns: matchDayPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseDayPatterns,
    defaultParseWidth: "any"
  }),
  dayPeriod: buildMatchFn({
    matchPatterns: matchDayPeriodPatterns,
    defaultMatchWidth: "any",
    parsePatterns: parseDayPeriodPatterns,
    defaultParseWidth: "any"
  })
};

// dist/locale/ka.js
var ka = {
  code: "ka",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 1
  }
};

// dist/locale/ka/cdn.js
window.dateFns = _objectSpread(_objectSpread({},
window.dateFns), {}, {
  locale: _objectSpread(_objectSpread({}, (_window$dateFns =
  window.dateFns) === null || _window$dateFns === void 0 ? void 0 : _window$dateFns.locale), {}, {
    ka: ka }) });



//# debugId=4FAFB5D76E6DCF2064756E2164756E21

//# sourceMappingURL=cdn.js.map
})();