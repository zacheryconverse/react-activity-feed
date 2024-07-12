// @ts-nocheck
import { parse } from 'igc-parser';
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
  gliderId?: string;
  pilot?: string;
  site?: string;
  task?: string;
}

export const parseIgcFile = (igcFileContent: string): FlightData | null => {
  try {
    return parse(igcFileContent) as unknown as FlightData;
  } catch (error) {
    console.error('Error parsing IGC file:', error);
    return null;
  }
};

export interface FlightStatistics {
  avgSpeed: number;
  coefficient: number;
  date: Date;
  flightDuration: string;
  freeDistance: number;
  gliderType: string;
  maxAltitude: number;
  maxAltitudeGain: number;
  maxClimbRate: number;
  maxSinkRate: number;
  pilot: string;
  routeType: string;
  site: string;
  score?: number;
}

/**
 * Extracts flight statistics from the given flight data.
 * @param {FlightData} flightData - The flight data obtained from parsing an IGC file.
 * @returns {FlightStatistics | null} An object containing various flight statistics or null if data is invalid.
 */
export const extractFlightStatistics = (flightData: FlightData): FlightStatistics | null => {
  if (!flightData || !flightData.fixes || flightData.fixes.length === 0) {
    console.error('Invalid flight data:', flightData);
    return null;
  }
  console.log('flightData', flightData);
  const { fixes, date, gliderId, pilot, site } = flightData;

  // Ensure the time is in the correct format
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

  // Calculate maximum altitude reached during the flight.
  const maxAltitude = fixes.reduce((max, fix) => Math.max(max, fix.gpsAltitude), fixes[0].gpsAltitude);

  // Calculate total distance flown using the Haversine formula.
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
  let maxClimbRate = -Infinity;
  let maxSinkRate = Infinity;
  let totalDuration = 0;

  const standardizedPeriod = 10; // seconds
  let altitudeGain = 0;
  let climbRate = 0;
  let sinkRate = 0;

  for (let i = 1; i < fixes.length; i++) {
    totalDistance += haversineDistance(
      fixes[i].latitude,
      fixes[i].longitude,
      fixes[i - 1].latitude,
      fixes[i - 1].longitude,
    );

    const duration = (new Date(fixes[i].time).getTime() - new Date(fixes[i - 1].time).getTime()) / 1000; // in seconds

    if (duration > 0) {
      altitudeGain = fixes[i].gpsAltitude - fixes[i - 1].gpsAltitude;

      if (duration <= standardizedPeriod) {
        climbRate = altitudeGain / duration;
        sinkRate = altitudeGain / duration;
      }

      maxClimbRate = Math.max(maxClimbRate, climbRate);
      maxSinkRate = Math.min(maxSinkRate, sinkRate);
    }

    maxAltitudeGain = Math.max(maxAltitudeGain, altitudeGain);

    totalDuration += duration;
  }

  freeDistance = parseFloat(totalDistance.toFixed(2));
  const avgSpeed = totalDistance / (totalDuration / 3600); // km/h
  const flight = solver(igcContent, scoringRules.XContest).next().value;
  const score = flight?.score;

  console.log(totalDistance, maxAltitudeGain, maxClimbRate, maxSinkRate, avgSpeed);

  return {
    flightDuration,
    maxAltitude,
    totalDistance,
    date,
    pilot,
    gliderType: gliderId,
    site,
    maxAltitudeGain,
    maxClimbRate,
    maxSinkRate,
    avgSpeed,
    freeDistance,
    score,
    // coefficient: 1,
    // routeType: "Flat Triangle",
  };
};
