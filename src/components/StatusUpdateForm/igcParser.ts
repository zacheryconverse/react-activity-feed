// @ts-nocheck
import { parse, isValid } from 'igc-parser';
import { solver, scoringRules } from 'igc-xc-score';

export interface Fix {
  gpsAltitude: number;
  latitude: number;
  longitude: number;
  time: string;
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
  if (!isValid(igcFileContent)) {
    console.error('Invalid IGC file content');
    return null;
  }

  try {
    return parse(igcFileContent) as unknown as FlightData;
  } catch (error) {
    console.error('Error parsing IGC file:', error);
    return null;
  }
};

export interface FlightStatistics {
  avgSpeed: number;
  date: Date;
  flightDuration: string;
  freeDistance: number;
  gliderType: string;
  maxAltitude: number;
  maxAltitudeGain: number;
  maxClimbRate: number;
  maxSinkRate: number;
  pilot: string;
  score?: number;
  site?: string;
}

export const extractFlightStatistics = (flightData: FlightData): FlightStatistics | null => {
  if (!flightData || !flightData.fixes || flightData.fixes.length === 0) {
    console.error('Invalid flight data:', flightData);
    return null;
  }
  console.log('parser file flightData', flightData);
  const { fixes, date, gliderType, pilot, site } = flightData;

  const parseTime = (timeStr: string): Date | null => {
    const regex = /(\d{2}):(\d{2}):(\d{2})/;
    const match = timeStr.match(regex);
    if (match) {
      const [, hours, minutes, seconds] = match;
      const date = new Date();
      date.setUTCHours(parseInt(hours), parseInt(minutes), parseInt(seconds));
      return date;
    }
    console.error('Failed to parse time:', timeStr);
    return null;
  };

  const startTime = parseTime(fixes[0].time);
  const endTime = parseTime(fixes[fixes.length - 1].time);

  if (!startTime || !endTime) {
    console.error('Failed to parse start or end time:', { startTime, endTime });
    return null;
  }

  const formatDuration = (milliseconds: number): string => {
    const totalMinutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}h ${minutes}m`;
  };

  const flightDuration = formatDuration(endTime.getTime() - startTime.getTime());

  const maxAltitude = fixes.reduce((max, fix) => Math.max(max, fix.gpsAltitude), fixes[0].gpsAltitude);

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

  let totalDistance = 0;
  let maxAltitudeGain = 0;

  for (let i = 1; i < fixes.length; i++) {
    totalDistance += haversineDistance(
      fixes[i].latitude,
      fixes[i].longitude,
      fixes[i - 1].latitude,
      fixes[i - 1].longitude,
    );

    const altitudeGain = fixes[i].gpsAltitude - fixes[i - 1].gpsAltitude;
    if (altitudeGain > 0) {
      maxAltitudeGain += altitudeGain;
    }
  }

  const flightDurationInSeconds = (endTime.getTime() - startTime.getTime()) / 1000; // in seconds
  const avgSpeed = (totalDistance / (flightDurationInSeconds / 3600)).toFixed(2); // km/h

  const calculateMaxRates = (fixes, windowSize) => {
    let maxClimb = -Infinity;
    let maxSink = Infinity;

    for (let i = 0; i < fixes.length - windowSize; i++) {
      const startFix = fixes[i];
      const endFix = fixes[i + windowSize];
      const duration = (parseTime(endFix.time).getTime() - parseTime(startFix.time).getTime()) / 1000; // in seconds

      if (duration > 0) {
        const altitudeChange = endFix.gpsAltitude - startFix.gpsAltitude;
        const rate = altitudeChange / duration;

        if (rate > 0) {
          maxClimb = Math.max(maxClimb, rate);
        } else {
          maxSink = Math.min(maxSink, rate);
        }
      }
    }
    return { maxClimb, maxSink };
  };

  const { maxClimb, maxSink } = calculateMaxRates(fixes, 15);

  const flight = solver(flightData, scoringRules.XContest).next().value;
  const score = flight?.score;

  return {
    flightDuration,
    maxAltitude,
    freeDistance: parseFloat(totalDistance.toFixed(2)),
    date,
    pilot,
    gliderType,
    site,
    maxAltitudeGain,
    maxClimb: parseFloat(maxClimb.toFixed(1)),
    maxSink: parseFloat((-maxSink).toFixed(1)),
    avgSpeed: parseFloat(avgSpeed),
    score,
  };
};
