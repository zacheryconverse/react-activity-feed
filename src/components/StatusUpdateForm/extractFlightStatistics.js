const haversineDistance = (lat1, lon1, lat2, lon2) => {
  if (
    typeof lat1 === 'undefined' ||
    typeof lon1 === 'undefined' ||
    typeof lat2 === 'undefined' ||
    typeof lon2 === 'undefined'
  ) {
    console.error(`Invalid coordinates for haversineDistance: (${lat1}, ${lon1}), (${lat2}, ${lon2})`);
    return NaN;
  }

  const toRadians = (deg) => deg * (Math.PI / 180);
  const R = 6371; // Earth's radius in kilometers

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const getAltitude = (fix) => fix.gpsAltitude ?? fix.pressureAltitude ?? 0;

/** Rolling average over time window. Aligns with Sidekick/STL total climb. */
const SMOOTH_WINDOW_SECONDS = 10;

function smoothAltitudeTimeWindow(fixes, windowSeconds) {
  const windowMs = windowSeconds * 1000;
  const result = [];
  for (let i = 0; i < fixes.length; i++) {
    const t = fixes[i].timestamp;
    const tStart = t - windowMs / 2;
    const tEnd = t + windowMs / 2;
    let sum = 0;
    let count = 0;
    for (let j = 0; j < fixes.length; j++) {
      if (fixes[j].timestamp >= tStart && fixes[j].timestamp <= tEnd) {
        sum += getAltitude(fixes[j]);
        count++;
      }
    }
    result.push(count > 0 ? sum / count : getAltitude(fixes[i]));
  }
  return result;
}

const calculateMaxAltitudeGainAndDistance = (fixes) => {
  let maxAltitudeGain = 0;
  let totalDistance = 0;
  const smoothed = smoothAltitudeTimeWindow(fixes, SMOOTH_WINDOW_SECONDS);

  for (let i = 1; i < fixes.length; i++) {
    const altitudeGain = smoothed[i] - smoothed[i - 1];
    // Threshold 0.5m: filters noise; IGC integer meters so >0.5 includes 1m gains
    if (altitudeGain > 0.5) {
      maxAltitudeGain += altitudeGain;
    }

    totalDistance += haversineDistance(
      fixes[i].latitude,
      fixes[i].longitude,
      fixes[i - 1].latitude,
      fixes[i - 1].longitude,
    );
  }

  return { maxAltitudeGain, totalDistance };
};

const calculateMaxRates = (elev, time, windowSizeSeconds = 30) => {
  let maxClimb = -Infinity;
  let maxSink = Infinity;

  for (let i = 0; i < elev.length; i++) {
    let endIndex = i;
    while (endIndex < elev.length && time[endIndex] - time[i] < windowSizeSeconds * 1000) {
      endIndex++;
    }

    if (endIndex < elev.length) {
      const altitudeChange = elev[endIndex] - elev[i];
      const timeChange = (time[endIndex] - time[i]) / 1000;
      const rate = altitudeChange / timeChange;

      if (rate > 0) {
        maxClimb = Math.max(maxClimb, rate);
      } else {
        maxSink = Math.min(maxSink, rate);
      }
    }
  }

  return { maxClimb, maxSink };
};

const calculateTotalLegDistance = (startPoint, endPoint, tp, legs) => {
  let totalLegDistance = 0;
  let previousPoint = startPoint;

  totalLegDistance += haversineDistance(previousPoint.latitude, previousPoint.longitude, tp[0].y, tp[0].x);
  previousPoint = tp[0];

  legs.forEach((leg) => {
    totalLegDistance += leg.d;
    previousPoint = leg.finish;
  });

  // totalLegDistance += haversineDistance(previousPoint.y, previousPoint.x, endPoint.latitude, endPoint.longitude);

  return totalLegDistance;
};

const extractFlightStatisticsTest = (result) => {
  const { scoreInfo, opt } = result;
  const { distance, score, tp, legs, cp, ep } = scoreInfo;
  const { flight, scoring } = opt;
  const { pilot, gliderType, site, date, fixes } = flight;

  const launchTime = fixes[0].timestamp;
  const landingTime = fixes[fixes.length - 1].timestamp;
  const flightDurationSeconds = (landingTime - launchTime) / 1000; // Convert milliseconds to seconds
  const flightDuration = formatDuration(flightDurationSeconds);

  const maxAltitude = Math.max(...fixes.map((fix) => getAltitude(fix)));
  const launchAltitude = getAltitude(fixes[0]);
  const landingAltitude = getAltitude(fixes[fixes.length - 1]);
  const { maxAltitudeGain, totalDistance } = calculateMaxAltitudeGainAndDistance(fixes);

  const turnpointsDuration =
    (ep ? fixes[ep.finish.r].timestamp - fixes[ep.start.r].timestamp : 0) ||
    (cp ? fixes[cp.out.r].timestamp - fixes[cp.in.r].timestamp : 0);
  const turnpointsDurationInHours = turnpointsDuration / 3600000;

  const { maxClimb, maxSink } = calculateMaxRates(
    fixes.map((fix) => getAltitude(fix)),
    fixes.map((fix) => fix.timestamp),
  );

  const startPoint = fixes[0];
  const endPoint = fixes[fixes.length - 1];
  const totalLegDistance = calculateTotalLegDistance(startPoint, endPoint, tp, legs);

  const routeLegDetails = [];
  const freeLegDetails = [];
  let previousPoint = { ...startPoint, r: startPoint.timestamp };

  const addLegDetails = (length, array, totalDistance) => {
    const legPercentOfRoute = (length / totalDistance) * 100;
    array.push({
      length: length.toFixed(2),
      percentOfRoute: legPercentOfRoute.toFixed(2),
    });
  };

  let legDistance = haversineDistance(previousPoint.latitude, previousPoint.longitude, tp[0].y, tp[0].x);
  addLegDetails(legDistance, freeLegDetails, totalLegDistance);
  previousPoint = tp[0];

  legs.forEach((leg) => {
    legDistance = leg.d;
    addLegDetails(legDistance, routeLegDetails, distance);
    addLegDetails(legDistance, freeLegDetails, totalLegDistance);
    previousPoint = leg.finish;
  });

  legDistance = haversineDistance(previousPoint.y, previousPoint.x, endPoint.latitude, endPoint.longitude);
  addLegDetails(legDistance, freeLegDetails, totalLegDistance);

  let maxSpeed = -Infinity;
  const windowSize = 15;

  for (let i = 0; i <= fixes.length - windowSize; i++) {
    let windowDistance = 0;
    let windowTime = 0;

    for (let j = i; j < i + windowSize - 1; j++) {
      windowDistance += haversineDistance(
        fixes[j].latitude,
        fixes[j].longitude,
        fixes[j + 1].latitude,
        fixes[j + 1].longitude,
      );
      windowTime += (fixes[j + 1].timestamp - fixes[j].timestamp) / 1000;
    }

    const windowSpeed = windowDistance / (windowTime / 3600);

    if (windowSpeed > maxSpeed) {
      maxSpeed = windowSpeed;
    }
  }

  const points = [];

  points.push({
    label: 'First Fix',
    latitude: fixes[0].latitude,
    longitude: fixes[0].longitude,
    time: fixes[0].time,
  });

  if (cp && cp.in) {
    const cpInFix = fixes[cp.in.r];
    points.push({
      label: 'CP In',
      latitude: cp.in.y,
      longitude: cp.in.x,
      time: cpInFix.time,
    });
  } else if (ep && ep.start) {
    const epStartFix = fixes[ep.start.r];
    points.push({
      label: 'Start',
      latitude: ep.start.y,
      longitude: ep.start.x,
      time: epStartFix.time,
    });
  }

  if (tp && tp.length) {
    tp.forEach((turnpoint, index) => {
      const tpFix = fixes[turnpoint.r];
      points.push({
        label: `TP${index + 1}`,
        latitude: turnpoint.y,
        longitude: turnpoint.x,
        time: tpFix.time,
      });
    });
  }

  if (cp && cp.out) {
    const cpOutFix = fixes[cp.out.r];
    points.push({
      label: 'CP Out',
      latitude: cp.out.y,
      longitude: cp.out.x,
      time: cpOutFix.time,
    });
  } else if (ep && ep.finish) {
    const epFinishFix = fixes[ep.finish.r];
    points.push({
      label: 'Finish',
      latitude: ep.finish.y,
      longitude: ep.finish.x,
      time: epFinishFix.time,
    });
  }

  points.push({
    label: 'Last Fix',
    latitude: fixes[fixes.length - 1].latitude,
    longitude: fixes[fixes.length - 1].longitude,
    time: fixes[fixes.length - 1].time,
  });

  let totalPointsDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalPointsDistance += haversineDistance(
      points[i].latitude,
      points[i].longitude,
      points[i + 1].latitude,
      points[i + 1].longitude,
    );
  }

  const routeDistance = score / scoring?.multiplier;
  const avgRouteSpeed = (routeDistance / turnpointsDurationInHours).toFixed(2);
  const freeDistanceAvgSpeed = totalPointsDistance / (flightDurationSeconds / 3600);

  return {
    points,
    pilot,
    date,
    site,
    classification: opt.scoring.name,
    score,
    routeDistance,
    distance,
    routeDuration: formatDuration(turnpointsDuration / 1000),
    avgRouteSpeed: parseFloat(avgRouteSpeed),
    routeLegDetails,
    freeLegDetails,
    flightDuration,
    freeDistance: parseFloat(totalPointsDistance.toFixed(2)),
    totalLegDistance: parseFloat(totalLegDistance.toFixed(2)),
    freeDistanceAvgSpeed: parseFloat(freeDistanceAvgSpeed).toFixed(2),
    maxSpeed: parseFloat(maxSpeed.toFixed(2)),
    maxClimb: parseFloat(maxClimb.toFixed(1)),
    maxSink: parseFloat((-maxSink).toFixed(1)),
    maxAltitude,
    launchAltitude,
    landingAltitude,
    maxAltitudeGain,
    gliderType,
    totalDistance: parseFloat(totalDistance.toFixed(2)),
  };
};

module.exports = { extractFlightStatisticsTest };
