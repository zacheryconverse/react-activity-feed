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

const getAltitude = (fix) => fix.gpsAltitude ?? fix.pressureAltitude ?? 0;
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
  console.log('Start Point:', startPoint);
  console.log('End Point:', endPoint);
  console.log('Turn Points:', tp);
  console.log('Legs:', legs);

  let totalLegDistance = 0;
  let previousPoint = startPoint;

  totalLegDistance += haversineDistance(previousPoint.latitude, previousPoint.longitude, tp[0].y, tp[0].x);
  console.log(`Initial Leg Distance: ${totalLegDistance}`);
  previousPoint = tp[0];

  legs.forEach((leg, index) => {
    totalLegDistance += leg.d;
    console.log(`Leg ${index + 1} Distance: ${leg.d}`);
    previousPoint = leg.finish;
  });

  // if (previousPoint.y && previousPoint.x && endPoint.latitude && endPoint.longitude) {
  //   const finalLegDistance = haversineDistance(previousPoint.y, previousPoint.x, endPoint.latitude, endPoint.longitude);
  //   totalLegDistance += finalLegDistance;
  //   console.log(`Final Leg Distance: ${finalLegDistance}`);
  // } else {
  //   console.error(
  //     `Invalid final coordinates for haversineDistance: (${previousPoint.y}, ${previousPoint.x}), (${endPoint.latitude}, ${endPoint.longitude})`,
  //   );
  // }

  console.log('Total Leg Distance:', totalLegDistance);
  return totalLegDistance;
};

const extractFlightStatistics = (result) => {
  const { scoreInfo, opt } = result;
  const { distance, score, tp, legs, ep, cp } = scoreInfo;
  const { flight } = opt;
  const { pilot, gliderType, site, date, fixes } = flight;
  const launchTime = fixes[0].timestamp;
  const landingTime = fixes[fixes.length - 1].timestamp;
  const flightDurationSeconds = (landingTime - launchTime) / 1000; // Convert milliseconds to seconds
  const flightDuration = formatDuration(flightDurationSeconds);

  const maxAltitude = Math.max(...fixes.map((fix) => fix.gpsAltitude));
  const { maxAltitudeGain, totalDistance } = calculateMaxAltitudeGainAndDistance(fixes);

  const turnpointsDuration =
    (ep ? fixes[ep.finish.r].timestamp - fixes[ep.start.r].timestamp : 0) ||
    (cp ? fixes[cp.out.r].timestamp - fixes[cp.in.r].timestamp : 0);
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
    ...(ep
      ? [
          {
            label: 'EP Start',
            time: formatTime(fixes[ep.start.r].timestamp),
            altitude: fixes[ep.start.r].gpsAltitude,
            ...formatCoordinates(fixes[ep.start.r].latitude, fixes[ep.start.r].longitude),
          },
          {
            label: 'EP Finish',
            time: formatTime(fixes[ep.finish.r].timestamp),
            altitude: fixes[ep.finish.r].gpsAltitude,
            ...formatCoordinates(fixes[ep.finish.r].latitude, fixes[ep.finish.r].longitude),
          },
        ]
      : []),
    ...(cp
      ? [
          {
            label: 'CP In',
            time: formatTime(fixes[cp.in.r].timestamp),
            altitude: fixes[cp.in.r].gpsAltitude,
            ...formatCoordinates(fixes[cp.in.r].latitude, fixes[cp.in.r].longitude),
          },
          {
            label: 'CP Out',
            time: formatTime(fixes[cp.out.r].timestamp),
            altitude: fixes[cp.out.r].gpsAltitude,
            ...formatCoordinates(fixes[cp.out.r].latitude, fixes[cp.out.r].longitude),
          },
        ]
      : []),
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
    totalDistance: parseFloat(totalDistance.toFixed(2)),
  };
};

module.exports = {
  extractFlightStatistics,
};
