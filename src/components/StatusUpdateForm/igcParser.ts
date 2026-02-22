// @ts-nocheck
import { parse } from 'igc-parser';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { Feature, Polygon } from '@turf/helpers';
import { country_reverse_geocoding } from 'country-reverse-geocoding';

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

export const extractIgcCompetitionClass = (igcContent: string): string | null => {
  if (!igcContent || typeof igcContent !== 'string') return null;
  const lines = igcContent.split(/\r?\n/);
  for (const line of lines) {
    if (/^H[FSO]CCLCOMPETITION\s*CLASS:/i.test(line)) {
      const match = line.match(/^H[FSO]CCLCOMPETITION\s*CLASS:\s*(.+)/i);
      if (match) return match[1].trim();
    }
  }
  return null;
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
  landingAltitude: number;
  launchAltitude: number;
  maxAltitude: number;
  maxAltitudeGain: number;
  maxClimb: number;
  maxSink: number;
  maxSpeed: number;
  pilot: string;
  points: Point[];
  regions: string[];
  routeDistance: number;
  routeDuration: string;
  routeLegDetails: LegDetail[];
  score: number;
  site: string;
  totalDistance: number;
  avgRouteSpeed?: number;
  competitionClass?: string;
  country?: string;
  duration_s?: number;
  multiplier?: number;
  wingClass?: string;
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

interface TurnpointRef {
  r: number;
  x: number;
  y: number;
}

interface EpRef {
  finish?: TurnpointRef;
  start?: TurnpointRef;
}

interface CpRef {
  in?: TurnpointRef;
  out?: TurnpointRef;
}

interface FlightPoint {
  label: string;
  latitude: number;
  longitude: number;
  time: string;
}

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const getAltitude = (fix: Fix) => fix.gpsAltitude ?? (fix as Fix & { pressureAltitude?: number }).pressureAltitude ?? 0;

const calculateMaxAltitudeGainAndDistance = (fixes: Fix[]) => {
  let maxAltitudeGain = 0;
  let totalDistance = 0;

  for (let i = 1; i < fixes.length; i++) {
    const altitudeGain = getAltitude(fixes[i]) - getAltitude(fixes[i - 1]);
    // Threshold 1m filters GPS noise while aligning with apps like Sidekick
    if (altitudeGain > 1) {
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

const isPointInRegion = (latitude: number, longitude: number, region: { name: string; polygon: Feature<Polygon> }) => {
  try {
    const pt = point([longitude, latitude]);
    return booleanPointInPolygon(pt, region.polygon);
  } catch (error) {
    console.error(`Error checking point in region ${region.name}:`, error);
    return false;
  }
};

const calculateMaxSpeed = (fixes: Fix[], windowSize = 15): number => {
  let maxSpeed = -Infinity;

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

  return maxSpeed;
};

const createLegDetail = (length: number, totalDistance: number): LegDetail => {
  const legPercentOfRoute = (length / totalDistance) * 100;
  return {
    length: length.toFixed(2),
    percentOfRoute: legPercentOfRoute.toFixed(2),
  };
};

const buildFlightPoints = (
  fixes: Fix[],
  tp: TurnpointRef[] = [],
  cp?: CpRef | null,
  ep?: EpRef | null,
): FlightPoint[] => {
  const points: FlightPoint[] = [];

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

  return points;
};

const determineRegionsForFlight = (points: FlightPoint[], regions: { name: string; polygon: Feature<Polygon> }[]) => {
  const regionsForFlight = new Set<string>();
  const reverseGeocode = country_reverse_geocoding();
  let flightCountryCode: string | null = null;

  points.forEach((point) => {
    const country = reverseGeocode.get_country(point.latitude, point.longitude);
    const formattedCountry = country ? country.name.toLowerCase().replace(/\s/g, '') : null;

    if (!flightCountryCode && country?.code && typeof country.code === 'string') {
      flightCountryCode = country.code.toUpperCase();
    }

    if (country && !regionsForFlight.has(formattedCountry)) {
      regionsForFlight.add(formattedCountry);
    }

    regions.forEach((region) => {
      if (isPointInRegion(point.latitude, point.longitude, region)) {
        regionsForFlight.add(region.name);
      }
    });
  });

  return { regionsForFlight, flightCountryCode };
};

export const extractFlightStatistics = (
  result: Result,
  options: { competitionClass?: string | null; wingClass?: string | null } = {},
): FlightStatistics | null => {
  const { scoreInfo, opt } = result;
  const { distance, score, tp, legs, ep, cp } = scoreInfo;
  const { flight, scoring } = opt;
  const { pilot, gliderType, site, date, fixes } = flight;

  const launchTime = fixes[0].timestamp;
  const landingTime = fixes[fixes.length - 1].timestamp;
  const flightDurationSeconds = (landingTime - launchTime) / 1000;
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

  const routeLegDetails: LegDetail[] = [];
  const freeLegDetails: LegDetail[] = [];
  let previousPoint = { ...startPoint, r: startPoint.timestamp };

  let legDistance = haversineDistance(previousPoint.latitude, previousPoint.longitude, tp[0].y, tp[0].x);
  freeLegDetails.push(createLegDetail(legDistance, totalLegDistance));
  previousPoint = tp[0];

  legs.forEach((leg) => {
    legDistance = leg.d;
    routeLegDetails.push(createLegDetail(legDistance, distance));
    freeLegDetails.push(createLegDetail(legDistance, totalLegDistance));
    previousPoint = leg.finish;
  });

  legDistance = haversineDistance(previousPoint.y, previousPoint.x, endPoint.latitude, endPoint.longitude);
  freeLegDetails.push(createLegDetail(legDistance, totalLegDistance));

  const maxSpeed = calculateMaxSpeed(fixes);

  const points = buildFlightPoints(fixes, tp, cp, ep);

  const regions: { name: string; polygon: Feature<Polygon> }[] = [
    {
      name: 'alps',
      polygon: polygon([
        [
          [4.4, 43.7],
          [7.5, 43.9],
          [14.0, 45.6],
          [15.8, 46.4],
          [16.3, 48.0],
          [14.7, 48.1],
          [6.6, 47.2],
          [4.4, 43.7],
        ],
      ]),
    },
  ];

  const { regionsForFlight, flightCountryCode } = determineRegionsForFlight(points, regions);

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
  const multiplier = scoring?.multiplier || (score && routeDistance ? score / routeDistance : null);

  return {
    points,
    pilot,
    date,
    site,
    classification: opt.scoring.name,
    competitionClass: options.competitionClass || null,
    wingClass: options.wingClass || null,
    score,
    routeDistance,
    distance,
    routeDuration: formatDuration(turnpointsDuration / 1000),
    avgRouteSpeed: parseFloat(avgRouteSpeed),
    routeLegDetails,
    freeLegDetails,
    flightDuration,
    duration_s: Math.round(flightDurationSeconds),
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
    multiplier: multiplier || undefined,
    totalDistance,
    regions: Array.from(regionsForFlight),
    country: flightCountryCode,
  };
};
