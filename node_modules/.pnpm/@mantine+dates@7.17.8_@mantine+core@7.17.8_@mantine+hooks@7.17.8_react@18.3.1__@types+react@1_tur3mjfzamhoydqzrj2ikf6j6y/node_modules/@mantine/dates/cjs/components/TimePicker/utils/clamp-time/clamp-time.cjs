'use client';
'use strict';

var timeToSeconds = require('../time-to-seconds/time-to-seconds.cjs');

function clampTime(time, min, max) {
  const timeInSeconds = timeToSeconds.timeToSeconds(time);
  const minInSeconds = timeToSeconds.timeToSeconds(min);
  const maxInSeconds = timeToSeconds.timeToSeconds(max);
  const clampedSeconds = Math.max(minInSeconds, Math.min(timeInSeconds, maxInSeconds));
  return timeToSeconds.secondsToTime(clampedSeconds);
}

exports.clampTime = clampTime;
//# sourceMappingURL=clamp-time.cjs.map
