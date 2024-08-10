// @ts-nocheck
import { parse } from 'igc-parser';

export interface Fix {
  gpsAltitude: number;
  latitude: number;
  longitude: number;
  time: string;
  timestamp: number;
}

export interface FlightData {
  fixes: Fix[];
  date?: Date;
  gliderType?: string;
  pilot?: string;
  site?: string;
  task?: string;
}

export const parseIgcFile = (igcFileContent: string): FlightData | null => {
  try {
    return parse(igcFileContent) as unknown as FlightData;
  } catch (error) {
    console.error('Invalid IGC file content:', error);
    return null;
  }
};

export interface FlightStatistics {
  avgSpeed: number;
  classification: string;
  date: Date;
  flightDuration: string;
  freeDistance: number;
  freeDistanceAvgSpeed: number;
  freeLegDetails: LegDetail[];
  gliderType: string;
  maxAltitude: number;
  maxAltitudeGain: number;
  maxClimb: number;
  maxSink: number;
  maxSpeed: number;
  pilot: string;
  points: Point[];
  routeDistance: number;
  routeDuration: string;
  routeLegDetails: LegDetail[];
  score: number;
  site: string;
  totalDistance: number;
}

interface Point {
  altitude: number;
  formattedLat: string;
  formattedLon: string;
  label: string;
  time: string;
}

interface LegDetail {
  length: string;
  percentOfRoute: string;
}

interface ScoreInfo {
  distance: number;
  legs: Leg[];
  score: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tp: any[];
  cp?: {
    in: { r: number };
    out: { r: number };
  };
  ep?: {
    finish: { r: number };
    start: { r: number };
  };
}

interface Result {
  opt: {
    flight: FlightData;
    scoring: {
      name: string;
    };
  };
  scoreInfo: ScoreInfo;
}

interface Leg {
  d: number;
  finish: {
    latitude: number;
    longitude: number;
  };
}

const formatCoordinates = (lat: number, lon: number) => {
  const latDirection = lat >= 0 ? 'N' : 'S';
  const lonDirection = lon >= 0 ? 'E' : 'W';
  const formattedLat = `${Math.abs(lat).toFixed(4)}° ${latDirection}`;
  const formattedLon = `${Math.abs(lon).toFixed(4)}° ${lonDirection}`;
  return { formattedLat, formattedLon };
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toISOString().substring(11, 19);
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const calculateMaxAltitudeGainAndDistance = (fixes: Fix[]) => {
  let maxAltitudeGain = 0;
  let totalDistance = 0;

  for (let i = 1; i < fixes.length; i++) {
    const altitudeGain = fixes[i].gpsAltitude - fixes[i - 1].gpsAltitude;
    if (altitudeGain > 5) {
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

const calculateMaxRates = (elev: number[], time: number[], windowSizeSeconds = 30) => {
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

const calculateTotalLegDistance = (startPoint: Fix, endPoint: Fix, tp: { x: number; y: number }[], legs: Leg[]) => {
  let totalLegDistance = 0;
  let previousPoint = startPoint;

  totalLegDistance += haversineDistance(previousPoint.latitude, previousPoint.longitude, tp[0].y, tp[0].x);
  previousPoint = tp[0];

  legs.forEach((leg) => {
    totalLegDistance += leg.d;
    previousPoint = leg.finish;
  });

  // leave last leg out
  // totalLegDistance += haversineDistance(previousPoint.y, previousPoint.x, endPoint.latitude, endPoint.longitude);

  return totalLegDistance;
};

const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRadians = (deg: number): number => deg * (Math.PI / 180);
  const R = 6371; // Earth's radius in kilometers

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const extractFlightStatistics = (result: Result): FlightStatistics | null => {
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

  const closestFix = (timestamp, fixes) => {
    return fixes.reduce((prev, curr) =>
      Math.abs(curr.timestamp - timestamp) < Math.abs(prev.timestamp - timestamp) ? curr : prev,
    );
  };

  const points: Point[] = [
    {
      label: 'Start',
      time: formatTime(fixes[0].timestamp),
      altitude: fixes[0].gpsAltitude,
      ...formatCoordinates(fixes[0].latitude, fixes[0].longitude),
    },
    ...(tp
      .map((turnpoint, index) => {
        const fix = closestFix(turnpoint.r, fixes);
        return fix
          ? {
              label: `TP${index + 1}`,
              time: formatTime(fix.timestamp),
              altitude: fix.gpsAltitude,
              ...formatCoordinates(fix.latitude, fix.longitude),
            }
          : null;
      })
      .filter(Boolean) as Point[]),
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

  const routeLegDetails: LegDetail[] = [];
  const freeLegDetails: LegDetail[] = [];
  let previousPoint = { ...startPoint, r: startPoint.timestamp };

  const addLegDetails = (length: number, array: LegDetail[], totalDistance: number) => {
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

  const freeDistanceAvgSpeed = totalLegDistance / (flightDurationSeconds / 3600);
  return {
    points,
    pilot,
    date,
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
