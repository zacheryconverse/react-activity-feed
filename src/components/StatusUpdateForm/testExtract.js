const fs = require('fs');
const path = require('path');
const { parse } = require('igc-parser');
const { solver, scoringRules } = require('igc-xc-score');
// const { extractFlightStatistics } = require('./testParse');
const { extractFlightStatisticsTest } = require('./extractFlightStatistics');

const loadIgcData = (filePath) => fs.readFileSync(filePath, 'utf8');

const igcFilePath = path.join('/Users/zacheryconverse/Downloads/2024-07-22-free-triangle.IGC');
const igcData = loadIgcData(igcFilePath);

const parsedIgc = parse(igcData);
const scoringResult = solver(parsedIgc, scoringRules.XContest).next().value;

// const flightStats = extractFlightStatistics(scoringResult);
const flightStats = extractFlightStatisticsTest(scoringResult);

// console.log('Parsed IGC Data:', parsedIgc);
// console.log('Scoring Result:', scoringResult);
console.log('Flight Statistics:', flightStats);
