const { haversineDistance } = require('./classifyTrack');

const formatCoordinates = (lat, lon) => {
  const latDirection = lat >= 0 ? 'N' : 'S';
  const lonDirection = lon >= 0 ? 'E' : 'W';
  const formattedLat = `${Math.abs(lat).toFixed(4)}° ${latDirection}`;
  const formattedLon = `${Math.abs(lon).toFixed(4)}° ${lonDirection}`;
  return { formattedLat, formattedLon };
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toISOString().substring(11, 19);
};

const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const calculateMaxAltitudeGain = (fixes) => {
  let maxAltitudeGain = 0;
  for (let i = 1; i < fixes.length; i++) {
    const altitudeGain = fixes[i].gpsAltitude - fixes[i - 1].gpsAltitude;
    if (altitudeGain > 5) {
      maxAltitudeGain += altitudeGain;
    }
  }
  return maxAltitudeGain;
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

  totalLegDistance += haversineDistance(previousPoint.y, previousPoint.x, endPoint.latitude, endPoint.longitude);

  return totalLegDistance;
};

const extractFlightStatisticsTest = (result) => {
  const { scoreInfo, opt } = result;
  const { distance, score, tp, legs, cp } = scoreInfo;
  const { flight } = opt;
  const { pilot, gliderType, site, date, fixes } = flight;

  const launchTime = fixes[0].timestamp;
  const landingTime = fixes[fixes.length - 1].timestamp;
  const flightDurationSeconds = (landingTime - launchTime) / 1000; // Convert milliseconds to seconds
  const flightDuration = formatDuration(flightDurationSeconds);

  const maxAltitude = Math.max(...fixes.map((fix) => fix.gpsAltitude));
  const maxAltitudeGain = calculateMaxAltitudeGain(fixes);

  const cpInFix = fixes[cp.in.r];
  const cpOutFix = fixes[cp.out.r];
  const turnpointsDuration = cpOutFix.timestamp - cpInFix.timestamp;
  const turnpointsDurationInHours = turnpointsDuration / 3600000;
  const avgSpeed = (distance / turnpointsDurationInHours).toFixed(2); // km/h

  const { maxClimb, maxSink } = calculateMaxRates(
    fixes.map((fix) => fix.gpsAltitude),
    fixes.map((fix) => fix.timestamp),
  );

  const points = [
    {
      label: 'Start',
      time: formatTime(fixes[0].timestamp),
      altitude: fixes[0].gpsAltitude,
      ...formatCoordinates(fixes[0].latitude, fixes[0].longitude),
    },
    {
      label: 'CP In',
      time: formatTime(cpInFix.timestamp),
      altitude: cpInFix.gpsAltitude,
      ...formatCoordinates(cpInFix.latitude, cpInFix.longitude),
    },
    ...tp
      .map((turnpoint, index) => {
        const fix = fixes.find((f) => f.timestamp >= turnpoint.r);
        return fix
          ? {
              label: `TP${index + 1}`,
              time: formatTime(fix.timestamp),
              altitude: fix.gpsAltitude,
              ...formatCoordinates(fix.latitude, fix.longitude),
            }
          : null;
      })
      .filter(Boolean),
    {
      label: 'CP Out',
      time: formatTime(cpOutFix.timestamp),
      altitude: cpOutFix.gpsAltitude,
      ...formatCoordinates(cpOutFix.latitude, cpOutFix.longitude),
    },
    {
      label: 'End',
      time: formatTime(fixes[fixes.length - 1].timestamp),
      altitude: fixes[fixes.length - 1].gpsAltitude,
      ...formatCoordinates(fixes[fixes.length - 1].latitude, fixes[fixes.length - 1].longitude),
    },
  ];

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
  let totalFreeDistanceTime = 0;
  let totalFreeDistance = 0;
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

    totalFreeDistance += windowDistance;
    totalFreeDistanceTime += windowTime;
  }

  const freeDistanceAvgSpeed = (totalFreeDistance / (totalFreeDistanceTime / 3600)).toFixed(2);

  return {
    points,
    pilot,
    date: new Date(date),
    site,
    classification: opt.scoring.name,
    score,
    routeDistance: distance,
    routeDuration: formatDuration(turnpointsDuration / 1000),
    avgSpeed: parseFloat(avgSpeed),
    routeLegDetails,
    freeLegDetails,
    flightDuration,
    freeDistance: parseFloat(totalLegDistance.toFixed(2)),
    freeDistanceAvgSpeed: parseFloat(freeDistanceAvgSpeed),
    maxSpeed: parseFloat(maxSpeed.toFixed(2)),
    maxClimb: parseFloat(maxClimb.toFixed(1)),
    maxSink: parseFloat((-maxSink).toFixed(1)),
    maxAltitude,
    maxAltitudeGain,
    gliderType,
  };
};

module.exports = { extractFlightStatisticsTest };
