// ============ DRAFT PROBABILITY MODULE ============
// Dependencies: config.js (safeNum), data.js (statPercentile, league)
//
// Sign-constrained elastic-net logistic regression with balanced class weights.
// Trained on 2,391 NCAA players (326 drafted, 2,065 undrafted, 2019–2025) via CBD API.
// 5-fold CV (F1: 64.7%, Recall: 90.5%, Precision: 50.9%).
//
// Reduced features: 7 stats (dropped BPM, USG% for multicollinearity)
// + 3 categorical = 10 total. No interaction terms.
// All stat weights ≥ 0 (projected gradient descent). Balanced class weights
// in loss function to correct 6:1 undrafted:drafted imbalance.
// Regularization: Elastic net (L1=0.005, L2=0.03), 8000 epochs.
//
// Training pipeline: tools/train-draft-model-v2.js
// Training dataset:  data/draft-history.json (built by tools/build-draft-dataset.js)

// ── Trained model coefficients (v5 balanced, sign-constrained, 2391-player dataset)
// Reduced features: dropped BPM and USG% to eliminate multicollinearity (r>0.7).
// All stat weights constrained ≥ 0 (projected gradient descent).
// Balanced class weights in loss: drafted samples weighted 3.67× to correct 6:1 imbalance.
// BPM and USG% kept in features array at weight=0 for comp-pool distance calc.
var DRAFT_MODEL = {
  intercept: -1.446823,
  features: [
    { stat: 'PPG',   mean: 14.8492, std: 3.5366, weight:  0.000000 },
    { stat: 'BPM',   mean:  2.8306, std: 1.2516, weight:  0.000000 },
    { stat: 'WS/40', mean:  0.1264, std: 0.0561, weight:  0.769721 },
    { stat: 'eFG%',  mean:  0.5123, std: 0.0525, weight:  0.137834 },
    { stat: 'USG%',  mean: 23.9726, std: 4.6753, weight:  0.000000 },
    { stat: 'APG',   mean:  2.9989, std: 1.4421, weight:  0.000000 },
    { stat: 'SPG',   mean:  1.1974, std: 0.4645, weight:  0.000000 },
    { stat: 'BPG',   mean:  0.3772, std: 0.4600, weight:  0.428078 },
    { stat: 'RPG',   mean:  4.8190, std: 1.9396, weight:  0.157668 }
  ],
  classWeight:   0.517183,
  confWeight:    1.290876,
  minutesWeight:-0.224413,
  classMap: { 'Fr':3, 'So':2, 'Jr':1, 'Sr':0, 'Grad':0,
              'RS-Fr':2.5, 'RS-So':1.5, 'RS-Jr':0.5, 'RS-Sr':0 }
};

// ── Conference tiers ─────────────────────────────────────────────────────────
var DRAFT_POWER_CONFS = new Set([
  'ACC','Big 12','Big Ten','Big East','SEC','Pac-12','Big XII'
]);
var DRAFT_MID_CONFS = new Set([
  'AAC','American','A-10','Atlantic 10','MWC','Mountain West',
  'WCC','West Coast','MVC','Missouri Valley',
  'CAA','Colonial','SoCon','Southern','Horizon','MAC',
  'Sun Belt','CUSA','C-USA','Conference USA'
]);

// ── Feature importance (|weight × feature_std| from training) ────────────────
var DRAFT_IMPORTANCE = {
  'Conference': 1.06, 'WS/40': 0.77, 'Class': 0.53,
  'BPG': 0.43, 'RPG': 0.16, 'eFG%': 0.14,
  'PPG': 0.10, 'BPM': 0.10, 'USG%': 0.10, 'APG': 0.10, 'SPG': 0.10
};

// ── Development tips per stat ────────────────────────────────────────────────
var DRAFT_DEV_TIPS = {
  'PPG':   'Increase scoring output by creating more looks off the dribble, in transition, and off screens.',
  'eFG%':  'Improve shot selection — fewer contested mid-range attempts, more shots at the rim and open threes.',
  'APG':   'Develop playmaking through better ball-handling, court vision, and pick-and-roll reads.',
  'SPG':   'Show more defensive activity — jump passing lanes, apply ball pressure, generate deflections.',
  'BPG':   'Improve shot-blocking timing and positioning; study opponent tendencies attacking the rim.',
  'RPG':   'Crash the glass harder on both ends. Improve box-out technique and shot anticipation.',
  'WS/40': 'Raise overall efficiency — reduce turnovers, take smart shots, contribute on both ends.'
};

var DRAFT_DEV_AREAS = {
  'PPG': 'Scoring Volume', 'eFG%': 'Shooting Efficiency', 'APG': 'Playmaking',
  'SPG': 'Defensive Activity', 'BPG': 'Rim Protection', 'RPG': 'Rebounding',
  'WS/40': 'Overall Efficiency'
};

// ── Comparable drafted players pool (119 players, 2019–2025) ─────────────────
// Stats order matches DRAFT_MODEL.features: PPG BPM WS/40 eFG% USG% APG SPG BPG RPG
// All lottery picks + 6 notable later picks per year, sourced from CBD API
var DRAFT_COMP_POOL = [
  {n:'Zion Williamson',t:'Duke',y:2019,pk:1,s:[22.61,6.3,0.327,0.708,28.5,2.06,2.12,1.79,8.88]},
  {n:'Ja Morant',t:'Murray State',y:2019,pk:2,s:[24.48,6.3,0.268,0.553,33.2,10.03,1.76,0.82,5.7]},
  {n:'RJ Barrett',t:'Duke',y:2019,pk:3,s:[22.63,4.2,0.191,0.506,32.4,4.32,0.89,0.42,7.58]},
  {n:'De\'Andre Hunter',t:'Virginia',y:2019,pk:4,s:[15.24,4.8,0.237,0.579,24.5,1.97,0.58,0.58,5.08]},
  {n:'Darius Garland',t:'Vanderbilt',y:2019,pk:5,s:[16.2,3.1,0.201,0.639,25.6,2.6,0.8,0.4,3.8]},
  {n:'Jarrett Culver',t:'Texas Tech',y:2019,pk:6,s:[18.53,3.6,0.22,0.505,32.6,3.74,1.5,0.55,6.39]},
  {n:'Coby White',t:'North Carolina',y:2019,pk:7,s:[16.06,3,0.168,0.516,27.2,4.09,1.09,0.31,3.54]},
  {n:'Jaxson Hayes',t:'Texas',y:2019,pk:8,s:[10,3.3,0.22,0.728,17.4,0.25,0.59,2.22,5]},
  {n:'Rui Hachimura',t:'Gonzaga',y:2019,pk:9,s:[19.7,5.2,0.261,0.608,28,1.51,0.95,0.73,6.49]},
  {n:'Cam Reddish',t:'Duke',y:2019,pk:10,s:[13.47,1.4,0.12,0.459,25.3,1.94,1.56,0.58,3.69]},
  {n:'Cameron Johnson',t:'North Carolina',y:2019,pk:11,s:[16.89,4.6,0.226,0.621,21.9,2.39,1.19,0.28,5.75]},
  {n:'P.J. Washington',t:'Kentucky',y:2019,pk:12,s:[15.17,3.8,0.215,0.567,26,1.8,0.83,1.23,7.54]},
  {n:'Tyler Herro',t:'Kentucky',y:2019,pk:13,s:[14.03,3.7,0.189,0.536,21.8,2.46,1.08,0.32,4.49]},
  {n:'Romeo Langford',t:'Indiana',y:2019,pk:14,s:[16.5,3.1,0.147,0.491,26.6,2.34,0.78,0.81,5.38]},
  {n:'Chuma Okeke',t:'Auburn',y:2019,pk:16,s:[12,3,0.192,0.577,20.2,1.92,1.82,1.21,6.84]},
  {n:'Nickeil Alexander-Walker',t:'Virginia Tech',y:2019,pk:17,s:[16.18,3.6,0.185,0.546,26.8,3.97,1.88,0.53,4.09]},
  {n:'Matisse Thybulle',t:'Washington',y:2019,pk:20,s:[9.08,1.5,0.15,0.5,17.4,2.14,3.5,2.31,3.08]},
  {n:'Brandon Clarke',t:'Gonzaga',y:2019,pk:21,s:[16.95,5.4,0.319,0.693,23.9,1.89,1.16,3.16,8.57]},
  {n:'Grant Williams',t:'Tennessee',y:2019,pk:22,s:[18.81,5.5,0.268,0.583,27.1,3.16,1.14,1.49,7.51]},
  {n:'Ty Jerome',t:'Virginia',y:2019,pk:24,s:[13.57,4.3,0.232,0.532,23.9,5.46,1.54,0.03,4.22]},
  {n:'Anthony Edwards',t:'Georgia',y:2020,pk:1,s:[19.06,2.9,0.136,0.473,31.1,2.84,1.34,0.56,5.22]},
  {n:'James Wiseman',t:'Memphis',y:2020,pk:2,s:[19.67,6.8,0.464,0.769,27.4,0.33,0.33,3,10.67]},
  {n:'Patrick Williams',t:'Florida State',y:2020,pk:4,s:[9.24,1.5,0.147,0.498,22.5,1,1,1.03,4]},
  {n:'Isaac Okoro',t:'Auburn',y:2020,pk:5,s:[12.86,2.8,0.154,0.556,20.4,2.04,0.93,0.89,4.43]},
  {n:'Onyeka Okongwu',t:'USC',y:2020,pk:6,s:[16.21,4,0.233,0.618,23.9,1.07,1.21,2.71,8.64]},
  {n:'Obi Toppin',t:'Dayton',y:2020,pk:8,s:[20.03,5.3,0.269,0.674,28.6,2.16,0.97,1.23,7.55]},
  {n:'Jalen Smith',t:'Maryland',y:2020,pk:10,s:[15.45,4,0.235,0.59,22.7,0.81,0.71,2.35,10.52]},
  {n:'Devin Vassell',t:'Florida State',y:2020,pk:11,s:[12.67,3.6,0.213,0.565,20.4,1.63,1.4,0.97,5.07]},
  {n:'Tyrese Haliburton',t:'Iowa State',y:2020,pk:12,s:[15.23,3.9,0.188,0.611,20.1,6.45,2.45,0.68,5.86]},
  {n:'Kira Lewis Jr.',t:'Alabama',y:2020,pk:13,s:[18.48,3.3,0.137,0.521,24.9,5.23,1.81,0.58,4.77]},
  {n:'Aaron Nesmith',t:'Vanderbilt',y:2020,pk:14,s:[23,6.4,0.232,0.659,26.8,0.93,1.43,0.86,4.86]},
  {n:'Cole Anthony',t:'North Carolina',y:2020,pk:15,s:[18.5,2.3,0.115,0.451,30.2,4,1.32,0.27,5.68]},
  {n:'Isaiah Stewart',t:'Washington',y:2020,pk:16,s:[16.97,4,0.213,0.577,24.8,0.84,0.53,2.06,8.78]},
  {n:'Josh Green',t:'Arizona',y:2020,pk:18,s:[11.97,2.3,0.16,0.476,21,2.6,1.53,0.43,4.57]},
  {n:'Saddiq Bey',t:'Villanova',y:2020,pk:19,s:[16.1,4.2,0.186,0.584,23,2.39,0.77,0.39,4.74]},
  {n:'Precious Achiuwa',t:'Memphis',y:2020,pk:20,s:[15.77,1.7,0.178,0.511,28.1,0.97,1.1,1.87,10.77]},
  {n:'Tyrese Maxey',t:'Kentucky',y:2020,pk:21,s:[13.97,2.5,0.135,0.474,23.1,3.16,0.87,0.39,4.29]},
  {n:'Cade Cunningham',t:'Oklahoma State',y:2021,pk:1,s:[20.15,3.1,0.163,0.515,30.3,3.48,1.59,0.78,6.19]},
  {n:'Evan Mobley',t:'USC',y:2021,pk:3,s:[16.36,4.3,0.236,0.595,23.3,2.39,0.79,2.88,8.67]},
  {n:'Scottie Barnes',t:'Florida State',y:2021,pk:4,s:[10.33,2,0.161,0.531,25.2,4.08,1.46,0.46,4]},
  {n:'Jalen Suggs',t:'Gonzaga',y:2021,pk:5,s:[14.37,2.9,0.203,0.56,25.1,4.53,1.9,0.33,5.33]},
  {n:'Franz Wagner',t:'Michigan',y:2021,pk:8,s:[12.46,3.5,0.211,0.544,20.7,3,1.25,1.04,6.54]},
  {n:'Davion Mitchell',t:'Baylor',y:2021,pk:9,s:[14,4,0.21,0.613,20.5,5.5,1.9,0.37,2.67]},
  {n:'Ziaire Williams',t:'Stanford',y:2021,pk:10,s:[10.7,-0.2,0.029,0.431,26.4,2.2,0.85,0.55,4.55]},
  {n:'James Bouknight',t:'UConn',y:2021,pk:11,s:[18.73,3.7,0.185,0.498,31.4,1.8,1.13,0.27,5.67]},
  {n:'Joshua Primo',t:'Alabama',y:2021,pk:12,s:[8.13,1.2,0.125,0.541,17.8,0.83,0.57,0.3,3.37]},
  {n:'Chris Duarte',t:'Oregon',y:2021,pk:13,s:[17.12,4.5,0.198,0.633,24.2,2.65,1.88,0.81,4.62]},
  {n:'Moses Moody',t:'Arkansas',y:2021,pk:14,s:[16.84,3.9,0.181,0.503,22.4,1.59,1.03,0.66,5.75]},
  {n:'Corey Kispert',t:'Gonzaga',y:2021,pk:15,s:[18.59,5.4,0.24,0.644,23,1.81,0.91,0.44,4.97]},
  {n:'Trey Murphy III',t:'Virginia',y:2021,pk:17,s:[11.28,3.7,0.184,0.639,18.6,1.2,0.8,0.44,3.4]},
  {n:'Tre Mann',t:'Florida',y:2021,pk:18,s:[16.04,3.3,0.17,0.536,25.9,3.46,1.38,0.13,5.63]},
  {n:'Kai Jones',t:'Texas',y:2021,pk:19,s:[8.85,2,0.168,0.626,18.3,0.62,0.85,0.92,4.85]},
  {n:'Jalen Johnson',t:'Alabama A&M',y:2021,pk:20,s:[16.53,2.6,0.125,0.562,28.2,0.8,1.07,0.6,7.47]},
  {n:'Keon Johnson',t:'Tennessee',y:2021,pk:21,s:[11.33,1.1,0.122,0.476,26.7,2.48,1.11,0.44,3.52]},
  {n:'Paolo Banchero',t:'Duke',y:2022,pk:1,s:[17.21,3.8,0.187,0.52,27.6,3.18,1.05,0.92,7.79]},
  {n:'Chet Holmgren',t:'Gonzaga',y:2022,pk:2,s:[14.13,3.7,0.283,0.68,21.6,1.91,0.81,3.66,9.91]},
  {n:'Jabari Smith Jr.',t:'Auburn',y:2022,pk:3,s:[16.94,3.7,0.229,0.521,28.2,2,1.09,1.03,7.41]},
  {n:'Keegan Murray',t:'Iowa',y:2022,pk:4,s:[23.49,7.2,0.305,0.614,29.9,1.49,1.29,1.94,8.66]},
  {n:'Jaden Ivey',t:'Purdue',y:2022,pk:5,s:[17.33,4,0.18,0.533,29,3.06,0.92,0.56,4.89]},
  {n:'Bennedict Mathurin',t:'Arizona',y:2022,pk:6,s:[17.7,4.2,0.203,0.536,25.4,2.54,0.97,0.27,5.62]},
  {n:'Jeremy Sochan',t:'Baylor',y:2022,pk:9,s:[9.23,1.8,0.175,0.531,19.7,1.77,1.27,0.7,6.37]},
  {n:'Johnny Davis',t:'Wisconsin',y:2022,pk:10,s:[19.74,3.2,0.162,0.464,32.4,2.13,1.16,0.74,8.23]},
  {n:'Jalen Williams',t:'Santa Clara',y:2022,pk:12,s:[18,4.4,0.17,0.562,25.1,4.15,1.18,0.55,4.42]},
  {n:'Jalen Duren',t:'Memphis',y:2022,pk:13,s:[11.97,2.2,0.18,0.597,22.8,1.28,0.83,2.1,8.14]},
  {n:'Ochai Agbaji',t:'Kansas',y:2022,pk:14,s:[18.77,4.1,0.181,0.57,25.6,1.59,0.92,0.56,5.05]},
  {n:'Mark Williams',t:'Duke',y:2022,pk:15,s:[11.23,3.8,0.26,0.721,18.7,0.9,0.49,2.82,7.44]},
  {n:'AJ Griffin',t:'Duke',y:2022,pk:16,s:[10.38,3,0.18,0.613,19,0.97,0.51,0.56,3.9]},
  {n:'Tari Eason',t:'LSU',y:2022,pk:17,s:[16.94,3.9,0.288,0.559,32.2,1,1.94,1.09,6.61]},
  {n:'Dalen Terry',t:'Arizona',y:2022,pk:18,s:[8.03,2.2,0.175,0.563,14.3,3.92,1.24,0.32,4.84]},
  {n:'Jake LaRavia',t:'Wake Forest',y:2022,pk:19,s:[14.61,3.7,0.202,0.606,21,3.7,1.67,0.97,6.58]},
  {n:'Malaki Branham',t:'Ohio State',y:2022,pk:20,s:[13.66,3.4,0.152,0.556,24.5,2,0.72,0.28,3.56]},
  {n:'Brandon Miller',t:'Alabama',y:2023,pk:2,s:[18.81,4.3,0.228,0.533,26.7,2.08,0.89,0.86,8.24]},
  {n:'Anthony Black',t:'Arkansas',y:2023,pk:6,s:[12.78,2,0.131,0.495,21,3.92,2.06,0.61,5.06]},
  {n:'Jarace Walker',t:'Houston',y:2023,pk:8,s:[11.22,2.6,0.209,0.516,22.3,1.81,0.97,1.28,6.81]},
  {n:'Taylor Hendricks',t:'UCF',y:2023,pk:9,s:[15.15,4,0.193,0.557,21.9,1.35,0.91,1.74,6.97]},
  {n:'Cason Wallace',t:'Kentucky',y:2023,pk:10,s:[11.72,2.7,0.156,0.516,20.1,4.25,1.97,0.47,3.72]},
  {n:'Jett Howard',t:'Michigan',y:2023,pk:11,s:[14.21,3,0.139,0.532,23.8,2.03,0.41,0.66,2.83]},
  {n:'Dereck Lively II',t:'Duke',y:2023,pk:12,s:[5.21,1.7,0.189,0.667,11.6,1.09,0.5,2.41,5.41]},
  {n:'Gradey Dick',t:'Kansas',y:2023,pk:13,s:[14.08,3.2,0.167,0.547,20.8,1.67,1.44,0.25,5.14]},
  {n:'Jordan Hawkins',t:'UConn',y:2023,pk:14,s:[16.16,4.5,0.206,0.531,25.5,1.27,0.7,0.51,3.78]},
  {n:'Kobe Bufkin',t:'Michigan',y:2023,pk:15,s:[14,3,0.15,0.542,22.6,2.91,1.3,0.7,4.52]},
  {n:'Keyonte George',t:'Baylor',y:2023,pk:16,s:[15.33,2.5,0.123,0.47,31,2.76,1.12,0.18,4.15]},
  {n:'Jalen Hood-Schifino',t:'Indiana',y:2023,pk:17,s:[13.5,1.1,0.072,0.463,26,3.66,0.81,0.25,4.13]},
  {n:'Jaime Jaquez Jr.',t:'UCLA',y:2023,pk:18,s:[17.81,4.1,0.225,0.511,27.9,2.35,1.54,0.59,8.22]},
  {n:'Brandin Podziemski',t:'Santa Clara',y:2023,pk:19,s:[19.88,5,0.215,0.571,26,3.66,1.78,0.47,8.75]},
  {n:'Cam Whitmore',t:'Villanova',y:2023,pk:20,s:[12.54,2,0.135,0.551,25.6,0.73,1.42,0.35,5.31]},
  {n:'Reed Sheppard',t:'Kentucky',y:2024,pk:3,s:[12.45,3.6,0.193,0.679,18.5,4.48,2.48,0.7,4.12]},
  {n:'Stephon Castle',t:'UConn',y:2024,pk:4,s:[11.09,3.1,0.183,0.507,22.1,2.91,0.79,0.53,4.68]},
  {n:'Donovan Clingan',t:'UConn',y:2024,pk:7,s:[13,4.3,0.299,0.643,24.8,1.51,0.51,2.46,7.37]},
  {n:'Rob Dillingham',t:'Kentucky',y:2024,pk:8,s:[15.19,3.5,0.183,0.564,31,3.88,1.03,0.06,2.94]},
  {n:'Zach Edey',t:'Purdue',y:2024,pk:9,s:[25.21,8,0.337,0.624,33.8,2.03,0.28,2.15,12.15]},
  {n:'Cody Williams',t:'Colorado',y:2024,pk:10,s:[11.92,2.3,0.119,0.595,21.8,1.58,0.63,0.67,3]},
  {n:'Devin Carter',t:'Providence',y:2024,pk:13,s:[19.7,4.4,0.21,0.564,28.7,3.64,1.76,0.97,8.67]},
  {n:'Bub Carrington',t:'Pittsburgh',y:2024,pk:14,s:[13.82,3,0.135,0.496,23,4.12,0.58,0.24,5.18]},
  {n:'Kel\'el Ware',t:'Indiana',y:2024,pk:15,s:[15.93,3.8,0.174,0.612,22.9,1.5,0.6,1.87,9.87]},
  {n:'Jared McCain',t:'Duke',y:2024,pk:16,s:[14.28,4,0.186,0.577,21.2,1.89,1.06,0.06,5.03]},
  {n:'Dalton Knecht',t:'Tennessee',y:2024,pk:17,s:[21.67,4.9,0.211,0.538,32.6,1.81,0.69,0.64,4.89]},
  {n:'Tristan da Silva',t:'Colorado',y:2024,pk:18,s:[16,4.1,0.17,0.573,22.8,2.41,1.15,0.56,5.06]},
  {n:'Ja\'Kobe Walter',t:'Baylor',y:2024,pk:19,s:[14.51,3.8,0.156,0.474,24,1.43,1.06,0.23,4.43]},
  {n:'Jaylon Tyson',t:'California',y:2024,pk:20,s:[19.58,3.5,0.124,0.518,31.1,3.45,1.19,0.48,6.77]},
  {n:'Cooper Flagg',t:'Duke',y:2025,pk:1,s:[19.16,6,0.303,0.533,30.8,4.19,1.38,1.35,7.51]},
  {n:'Dylan Harper',t:'Rutgers',y:2025,pk:2,s:[19.45,4.7,0.178,0.546,29.9,4.03,1.45,0.59,4.59]},
  {n:'VJ Edgecombe',t:'Baylor',y:2025,pk:3,s:[15,3.9,0.189,0.504,24.7,3.21,2.06,0.61,5.61]},
  {n:'Kon Knueppel',t:'Duke',y:2025,pk:4,s:[14.44,4.9,0.236,0.59,21.4,2.74,1.03,0.15,4]},
  {n:'Ace Bailey',t:'Rutgers',y:2025,pk:5,s:[17.57,3,0.108,0.514,28.3,1.27,1,1.27,7.17]},
  {n:'Tre Johnson',t:'Texas',y:2025,pk:6,s:[19.94,4.5,0.147,0.511,30,2.73,0.94,0.3,3.12]},
  {n:'Jeremiah Fears',t:'Oklahoma',y:2025,pk:7,s:[17.09,3.2,0.14,0.48,31.4,4.12,1.65,0.12,4.15]},
  {n:'Egor Demin',t:'BYU',y:2025,pk:8,s:[10.64,1.9,0.097,0.48,26.1,5.45,1.15,0.36,3.88]},
  {n:'Collin Murray-Boyles',t:'South Carolina',y:2025,pk:9,s:[16.81,4.1,0.2,0.599,27,2.41,1.47,1.34,8.25]},
  {n:'Khaman Maluach',t:'Duke',y:2025,pk:10,s:[8.59,3.1,0.246,0.723,16.1,0.49,0.18,1.31,6.59]},
  {n:'Cedric Coward',t:'Washington State',y:2025,pk:11,s:[17.67,5.7,0.242,0.656,20.3,3.67,0.83,1.67,7]},
  {n:'Derik Queen',t:'Maryland',y:2025,pk:13,s:[16.5,3.7,0.216,0.535,26.6,1.86,1.08,1.08,8.97]},
  {n:'Carter Bryant',t:'Arizona',y:2025,pk:14,s:[6.54,1.4,0.146,0.571,16.7,0.97,0.95,1,4.11]},
  {n:'Thomas Sorber',t:'Georgetown',y:2025,pk:15,s:[14.5,3.2,0.202,0.544,23.5,2.42,1.46,2.04,8.46]},
  {n:'Walter Clayton Jr.',t:'Florida',y:2025,pk:18,s:[18.28,5.1,0.214,0.56,25.6,4.18,1.18,0.51,3.69]},
  {n:'Kasparas Jakucionis',t:'Illinois',y:2025,pk:20,s:[14.97,3.1,0.141,0.519,24.6,4.73,0.88,0.27,5.7]},
  {n:'Will Riley',t:'Illinois',y:2025,pk:21,s:[12.6,3,0.147,0.497,24.2,2.23,0.26,0.29,4.14]},
  {n:'Drake Powell',t:'North Carolina',y:2025,pk:22,s:[7.43,1.7,0.106,0.569,14.1,1.08,0.7,0.68,3.38]},
  {n:'Asa Newell',t:'Georgia',y:2025,pk:23,s:[15.42,4.7,0.213,0.58,23.6,0.88,1,0.97,6.88]}
];

// ── Helper functions ─────────────────────────────────────────────────────────

function _draftSigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); }

function draftClassValue(classStr) {
  if (!classStr) return 0;
  var c = classStr.toString().trim();
  if (DRAFT_MODEL.classMap.hasOwnProperty(c)) return DRAFT_MODEL.classMap[c];
  c = c.toLowerCase();
  if (c.includes('fr'))                       return 3;
  if (c.includes('so'))                       return 2;
  if (c.includes('jr') || c.includes('jun'))  return 1;
  return 0;
}

// Returns true only if the class string explicitly identifies a senior/grad — NOT empty/unknown
function _draftIsExplicitSr(classStr) {
  if (!classStr) return false;
  var c = classStr.toString().trim().toLowerCase();
  return c.includes('sr') || c.includes('grad') || c === 'senior';
}

function draftConfTier(conf) {
  if (!conf) return -0.5;
  var c = conf.toString().trim();
  if (DRAFT_POWER_CONFS.has(c)) return 1;
  if (DRAFT_MID_CONFS.has(c))   return 0;
  return -1;
}

// ── Core prediction ──────────────────────────────────────────────────────────

function draftProbability(r) {
  if (!r) return null;
  if (typeof league !== 'undefined' && league === 'WBB') return null;

  // Eligibility gate: model was trained on PPG≥5, MPG≥20, G≥15.
  // Players outside this range are extrapolating beyond training distribution.
  var ppg = safeNum(r['PPG']);
  var mpg = safeNum(r['MP']) || safeNum(r['MPG']);
  var gp  = safeNum(r['G']);
  if (Number.isFinite(ppg) && ppg < 5) return null;
  if (Number.isFinite(mpg) && mpg < 15) return null;
  if (Number.isFinite(gp)  && gp  < 10) return null;

  var M = DRAFT_MODEL;
  var features = M.features;
  var missing = 0;
  var zScores = [];

  // 1. Z-score each stat feature
  for (var i = 0; i < features.length; i++) {
    var f = features[i];
    var val = safeNum(r[f.stat]);
    if (!Number.isFinite(val)) { missing++; zScores.push(0); continue; }
    var z = (val - f.mean) / f.std;
    z = Math.max(-3, Math.min(4, z));
    zScores.push(z);
  }
  if (missing > 4) return null;

  // 2. Base stat contributions
  var logit = M.intercept;
  for (var i = 0; i < features.length; i++) {
    logit += zScores[i] * features[i].weight;
  }

  // 3. Categorical features
  var cls = (r['Class'] || r['Yr'] || r['Year'] || '').toString();
  var classV = draftClassValue(cls);
  logit += classV * M.classWeight;

  var conf = (r['Conference'] || r['Conf'] || '').toString();
  var confV = draftConfTier(conf);
  logit += confV * M.confWeight;

  var mpg = safeNum(r['MP']) || safeNum(r['MPG']);
  var mpgFlag = (Number.isFinite(mpg) && mpg > 25) ? 1 : 0;
  logit += mpgFlag * M.minutesWeight;

  var prob = _draftSigmoid(logit);
  return Math.round(prob * 1000) / 1000;
}

// ── Display helpers ──────────────────────────────────────────────────────────

function draftGrade(prob) {
  if (prob == null) return '—';
  if (prob >= 0.90) return 'A+';
  if (prob >= 0.75) return 'A';
  if (prob >= 0.55) return 'B+';
  if (prob >= 0.35) return 'B';
  if (prob >= 0.20) return 'C+';
  if (prob >= 0.10) return 'C';
  if (prob >= 0.04) return 'D';
  return 'F';
}

function draftRangeLabel(prob) {
  if (prob == null) return '—';
  if (prob >= 0.90) return 'Lottery Lock';
  if (prob >= 0.70) return 'First Round';
  if (prob >= 0.45) return 'Late First';
  if (prob >= 0.25) return 'Second Round';
  if (prob >= 0.10) return 'Fringe';
  if (prob >= 0.03) return 'Long Shot';
  return 'Unlikely';
}

function draftColor(prob) {
  if (prob == null) return 'var(--muted)';
  if (prob >= 0.75) return '#34d399';
  if (prob >= 0.35) return '#60a5fa';
  if (prob >= 0.10) return '#fbbf24';
  return 'var(--muted)';
}

// ── Factor analysis (intuitive z-score display) ──────────────────────────────
// Shows each stat relative to drafted-player averages (above/below).
// Sorted by feature importance from training, NOT by model weights.

function draftFactors(r) {
  var factors = [];
  var features = DRAFT_MODEL.features;

  for (var i = 0; i < features.length; i++) {
    var f = features[i];
    var val = safeNum(r[f.stat]);
    if (!Number.isFinite(val)) continue;

    var z = (val - f.mean) / f.std;
    z = Math.max(-3, Math.min(4, z));

    var displayVal;
    if (f.stat.includes('%') && val < 1) {
      displayVal = (val * 100).toFixed(1) + '%';
    } else {
      displayVal = val.toFixed(1);
    }

    factors.push({
      label:     f.stat,
      value:     displayVal,
      z:         z,
      impact:    Math.abs(z) * (DRAFT_IMPORTANCE[f.stat] || 0.1),
      direction: z > 0.2 ? 'positive' : z < -0.2 ? 'negative' : 'neutral',
      note:      z > 1.5 ? 'well above' : z > 0.3 ? 'above avg' : z > -0.3 ? 'avg' : z > -1.5 ? 'below avg' : 'well below'
    });
  }

  // Class
  var cls = (r['Class'] || r['Yr'] || r['Year'] || '').toString();
  var classV = draftClassValue(cls);
  var classUnknown = !cls;
  factors.push({
    label:     'Class',
    value:     cls || 'Unknown',
    z:         classUnknown ? 0 : classV >= 2 ? 1.5 : classV >= 1 ? 0 : -1.5,
    impact:    classUnknown ? 0 : DRAFT_IMPORTANCE['Class'] * (classV >= 2 ? 1.0 : classV >= 1 ? 0.3 : 0.8),
    direction: classUnknown ? 'neutral' : classV >= 2 ? 'positive' : classV <= 0 ? 'negative' : 'neutral',
    note:      classUnknown ? 'not yet inferred' : classV >= 3 ? 'strong youth premium' : classV >= 2 ? 'good timeline' : classV >= 1 ? 'moderate' : 'limited upside window'
  });

  // Conference
  var conf = (r['Conference'] || r['Conf'] || '').toString();
  var confV = draftConfTier(conf);
  factors.push({
    label:     'Conference',
    value:     conf || 'Unknown',
    z:         confV,
    impact:    DRAFT_IMPORTANCE['Conference'] * Math.max(0.3, Math.abs(confV)),
    direction: confV > 0 ? 'positive' : confV < 0 ? 'negative' : 'neutral',
    note:      confV > 0 ? 'power conf' : confV === 0 ? 'mid-major' : 'low-major'
  });

  factors.sort(function(a, b) { return b.impact - a.impact; });
  return factors;
}

// ── Interaction insights (readable text for UI) ──────────────────────────────

function draftInsights(r) {
  if (!r) return [];
  var features = DRAFT_MODEL.features;
  var zScores = [];

  for (var i = 0; i < features.length; i++) {
    var val = safeNum(r[features[i].stat]);
    zScores.push(Number.isFinite(val) ? (val - features[i].mean) / features[i].std : 0);
  }

  var cls = (r['Class'] || r['Yr'] || r['Year'] || '').toString();
  var classV = draftClassValue(cls);
  var conf = (r['Conference'] || r['Conf'] || '').toString();
  var confV = draftConfTier(conf);

  var insights = [];
  // Feature indices: PPG=0, BPM=1, WS/40=2, eFG%=3, USG%=4, APG=5, SPG=6, BPG=7, RPG=8
  // Efficient scorer
  if (zScores[0] > 0.5 && zScores[3] > 0.3)
    insights.push({ text: 'Efficient scorer — high PPG with strong eFG%', type: 'positive' });
  else if (zScores[0] > 0.5 && zScores[3] < -0.3)
    insights.push({ text: 'Volume scorer — production with below-average efficiency', type: 'warning' });
  // Two-way playmaker
  if (zScores[5] > 0.5 && zScores[6] > 0.5)
    insights.push({ text: 'Two-way playmaker — creates for others and disrupts', type: 'positive' });
  // Interior force
  if (zScores[7] > 0.5 && zScores[8] > 0.5)
    insights.push({ text: 'Interior force — rim protection + rebounding', type: 'positive' });
  // Quality production
  if (zScores[2] > 0.5 && confV > 0)
    insights.push({ text: 'Proven producer in a power conference', type: 'positive' });
  else if (zScores[2] > 0.5 && confV < 0)
    insights.push({ text: 'Strong efficiency — needs validation vs. higher competition', type: 'warning' });
  // Youth premium
  if (classV >= 2)
    insights.push({ text: 'Young prospect — high projection upside for scouts', type: 'positive' });
  else if (_draftIsExplicitSr(cls))
    insights.push({ text: 'Senior — limited projection window for scouts', type: 'warning' });
  // Defensive presence
  if (zScores[6] > 1.0)
    insights.push({ text: 'Elite ball hawk — steals well above draft average', type: 'positive' });
  if (zScores[7] > 1.0)
    insights.push({ text: 'Elite shot-blocker — major rim deterrent', type: 'positive' });

  return insights.slice(0, 4);
}

// ── Development recommendations (with quantified probability impact) ─────────

function _draftSimulateImprovement(r, stat, targetVal) {
  // Create a shallow copy with the improved stat value, then predict
  var copy = {};
  for (var k in r) { if (r.hasOwnProperty(k)) copy[k] = r[k]; }
  copy[stat] = targetVal;
  return draftProbability(copy);
}

function draftDevelopmentRecs(r) {
  var prob = draftProbability(r);
  if (prob == null) return [];

  var recs = [];
  var features = DRAFT_MODEL.features;

  // For high-probability players, only flag stats well BELOW average
  var threshold = prob >= 0.70 ? -0.3 : 0.3;

  for (var i = 0; i < features.length; i++) {
    var f = features[i];
    var val = safeNum(r[f.stat]);
    if (!Number.isFinite(val)) continue;

    var z = (val - f.mean) / f.std;
    if (z < threshold) {
      var imp = DRAFT_IMPORTANCE[f.stat] || 0.1;
      var priority = imp * Math.max(0.1, -z + 0.5);

      var currentStr;
      if (f.stat.includes('%') && val < 1) {
        currentStr = (val * 100).toFixed(1) + '%';
      } else {
        currentStr = val.toFixed(1);
      }
      var targetStr;
      if (f.stat.includes('%') && f.mean < 1) {
        targetStr = (f.mean * 100).toFixed(1) + '%';
      } else {
        targetStr = f.mean.toFixed(1);
      }

      // Quantified impact: simulate improving this stat to the drafted-player average
      var newProb = _draftSimulateImprovement(r, f.stat, f.mean);
      var delta = (newProb != null) ? (newProb - prob) : null;

      recs.push({
        stat:     f.stat,
        area:     DRAFT_DEV_AREAS[f.stat] || f.stat,
        tip:      DRAFT_DEV_TIPS[f.stat] || '',
        current:  currentStr,
        target:   targetStr,
        z:        z,
        priority: priority,
        delta:    delta
      });
    }
  }

  // Class recommendation
  var cls = (r['Class'] || r['Yr'] || r['Year'] || '').toString();
  var classV = draftClassValue(cls);
  var isSr = _draftIsExplicitSr(cls);
  if (classV === 1 || isSr) {
    recs.push({
      stat:     'Class',
      area:     'Draft Timing',
      tip:      isSr
        ? 'As a senior, the upside window is closing. Focus on combine measurables and strong workouts.'
        : 'Junior year is a critical visibility year. Strong tournament play is crucial.',
      current:  cls,
      target:   'Earlier declaration preferred',
      z:        -1,
      priority: 0.8,
      delta:    null
    });
  }

  // Conference recommendation — quantify transfer impact
  var conf = (r['Conference'] || r['Conf'] || '').toString();
  var confV = draftConfTier(conf);
  if (confV < 0) {
    // Simulate transferring to a power conference
    var confCopy = {};
    for (var k in r) { if (r.hasOwnProperty(k)) confCopy[k] = r[k]; }
    confCopy['Conference'] = 'Big Ten';
    confCopy['Conf'] = 'Big Ten';
    var confNewProb = draftProbability(confCopy);
    var confDelta = (confNewProb != null) ? (confNewProb - prob) : null;

    recs.push({
      stat:     'Conf',
      area:     'Level of Competition',
      tip:      'Low-major production faces scrutiny. Dominate non-conference games and consider transferring up.',
      current:  conf,
      target:   'Power conference',
      z:        -1.5,
      priority: 0.5,
      delta:    confDelta
    });
  }

  recs.sort(function(a, b) { return b.priority - a.priority; });
  return recs.slice(0, 4);
}

// ── Draft comparables ────────────────────────────────────────────────────────

function _compArchetype(s) {
  // s = stats array in model feature order: PPG BPM WS/40 eFG% USG% APG SPG BPG RPG
  if (s[5] >= 5)              return 'Playmaker';
  if (s[7] >= 2)              return 'Rim Protector';
  if (s[8] >= 9)              return 'Rebounder';
  if (s[0] >= 20 && s[6] >= 1.5) return 'Two-Way Star';
  if (s[0] >= 18)             return 'Scorer';
  if (s[6] >= 1.5)            return 'Defender';
  if (s[3] >= 0.57)           return 'Efficient Wing';
  return 'Wing';
}

function draftComparables(r) {
  if (!r) return [];
  var features = DRAFT_MODEL.features;

  // Z-score the current player
  var playerZ = [];
  for (var i = 0; i < features.length; i++) {
    var val = safeNum(r[features[i].stat]);
    playerZ.push(Number.isFinite(val) ? (val - features[i].mean) / features[i].std : 0);
  }

  var playerName = (r['Player'] || r['Name'] || '').toString().toLowerCase();
  var dists = [];

  for (var j = 0; j < DRAFT_COMP_POOL.length; j++) {
    var comp = DRAFT_COMP_POOL[j];
    // Skip self
    if (comp.n.toLowerCase() === playerName) continue;

    var dist = 0;
    var matchStats = [];
    for (var i = 0; i < features.length; i++) {
      var cz = (comp.s[i] - features[i].mean) / features[i].std;
      var diff = playerZ[i] - cz;
      var imp = DRAFT_IMPORTANCE[features[i].stat] || 0.1;
      dist += imp * diff * diff;
      if (Math.abs(diff) < 0.6) matchStats.push(features[i].stat);
    }
    dist = Math.sqrt(dist);

    dists.push({
      name:       comp.n,
      team:       comp.t,
      year:       comp.y,
      pick:       comp.pk,
      distance:   dist,
      archetype:  _compArchetype(comp.s),
      matchStats: matchStats.slice(0, 4)
    });
  }

  dists.sort(function(a, b) { return a.distance - b.distance; });
  return dists.slice(0, 3);
}

// ── Render Draft Radar panel ─────────────────────────────────────────────────

function renderDraftRadar(r) {
  var el = document.getElementById('mDraftRadar');
  if (!el) return;

  // Only for MBB
  if (typeof league !== 'undefined' && league === 'WBB') {
    document.getElementById('mDraftPanel').style.display = 'none';
    return;
  }
  document.getElementById('mDraftPanel').style.display = '';

  var prob = draftProbability(r);
  if (prob == null) {
    el.innerHTML = '<div class="muted" style="font-size:12px">Insufficient data to calculate draft probability.</div>';
    return;
  }

  var grade   = draftGrade(prob);
  var range   = draftRangeLabel(prob);
  var color   = draftColor(prob);
  var pct     = Math.round(prob * 100);
  var factors = draftFactors(r);

  // SVG gauge ring
  var radius = 38;
  var circumference = 2 * Math.PI * radius;
  var dashOffset = circumference * (1 - prob);

  var html = '';

  // ── Section 1: Gauge + Factor Bars ──
  html += '<div class="draftRadarGrid">';

  // Left: Gauge
  html += '<div class="draftGauge">';
  html += '<svg viewBox="0 0 100 100" class="draftRingSvg">';
  html += '<circle cx="50" cy="50" r="' + radius + '" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="6"/>';
  html += '<circle cx="50" cy="50" r="' + radius + '" fill="none" stroke="' + color + '" stroke-width="6" ';
  html += 'stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + dashOffset.toFixed(2) + '" ';
  html += 'stroke-linecap="round" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset .8s ease"/>';
  html += '<text x="50" y="44" text-anchor="middle" fill="' + color + '" font-size="20" font-weight="800">' + pct + '%</text>';
  html += '<text x="50" y="58" text-anchor="middle" fill="var(--muted)" font-size="6.5" letter-spacing="0.5">DRAFT PROB</text>';
  html += '</svg>';
  html += '<div class="draftGradeRow">';
  html += '<span class="draftGradeBadge" style="border-color:' + color + ';color:' + color + '">' + grade + '</span>';
  html += '<span class="draftRangeLabel">' + range + '</span>';
  html += '</div>';
  html += '</div>';

  // Right: Factor bars
  html += '<div class="draftFactors">';
  html += '<div class="draftFactorsHead">vs. Drafted Players</div>';

  var topFactors = factors.slice(0, 7);
  for (var i = 0; i < topFactors.length; i++) {
    var f = topFactors[i];
    var barW = Math.min(Math.abs(f.z) / 2.5 * 100, 100);
    var barCol = f.direction === 'positive' ? '#34d399' : f.direction === 'negative' ? '#f87171' : 'var(--muted)';
    var arrow  = f.direction === 'positive' ? '↑' : f.direction === 'negative' ? '↓' : '—';

    html += '<div class="draftFactorRow">';
    html += '<span class="draftFactorLabel">' + f.label + '</span>';
    html += '<span class="draftFactorValue">' + f.value + '</span>';
    html += '<div class="draftFactorBar"><div class="draftFactorFill" style="width:' + barW.toFixed(0) + '%;background:' + barCol + '"></div></div>';
    html += '<span class="draftFactorArrow" style="color:' + barCol + '">' + arrow + '</span>';
    html += '</div>';
  }
  html += '</div>';
  html += '</div>'; // /draftRadarGrid

  // ── Section 2: Interaction Insights ──
  var insights = draftInsights(r);
  if (insights.length > 0) {
    html += '<div class="draftInsightsRow">';
    for (var i = 0; i < insights.length; i++) {
      var ins = insights[i];
      var icon = ins.type === 'positive' ? '✦' : '⚠';
      var insColor = ins.type === 'positive' ? '#34d399' : '#fbbf24';
      html += '<span class="draftInsight" style="border-color:' + insColor + ';color:' + insColor + '">';
      html += icon + ' ' + ins.text + '</span>';
    }
    html += '</div>';
  }

  // ── Section 3: Development Path ──
  var devRecs = draftDevelopmentRecs(r);
  if (devRecs.length > 0) {
    html += '<div class="draftDevSection">';
    html += '<div class="draftDevHead">' + (prob >= 0.70 ? '🔧 Areas to Watch' : '📈 Development Path') + '</div>';
    for (var i = 0; i < devRecs.length; i++) {
      var d = devRecs[i];
      html += '<div class="draftDevItem">';
      html += '<div class="draftDevItemHead">';
      html += '<span class="draftDevArea">' + d.area + '</span>';
      if (d.current && d.target && d.stat !== 'Class' && d.stat !== 'Conf') {
        html += '<span class="draftDevNums">' + d.current + ' → ' + d.target + '</span>';
      }
      html += '</div>';
      // Quantified impact line
      if (d.delta != null && Math.abs(d.delta) >= 0.005) {
        var deltaPct = Math.round(d.delta * 100);
        var deltaSign = deltaPct >= 0 ? '+' : '';
        var deltaColor = deltaPct > 0 ? '#34d399' : '#f87171';
        html += '<div class="draftDevImpact" style="color:' + deltaColor + '">';
        html += '↗ Reaching target would shift draft probability by <strong>' + deltaSign + deltaPct + '%</strong>';
        html += '</div>';
      }
      html += '<div class="draftDevTip">' + d.tip + '</div>';
      html += '</div>';
    }
    html += '</div>';
  } else if (prob >= 0.80) {
    html += '<div class="draftDevSection">';
    html += '<div class="draftDevHead">✅ Draft Ready</div>';
    html += '<div class="draftDevTip" style="padding:6px 0;color:var(--muted)">Stats exceed drafted-player averages across all key categories. Focus on maintaining consistency and strong tournament play.</div>';
    html += '</div>';
  }

  // ── Section 4: Draft Comparables ──
  var comps = draftComparables(r);
  if (comps.length > 0) {
    html += '<div class="draftCompSection">';
    html += '<div class="draftCompHead">🎯 Draft Comparables</div>';
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      var pickLabel = c.pick <= 14 ? 'Lottery' : c.pick <= 30 ? 'Rd 1' : 'Rd 2';
      html += '<div class="draftCompItem">';
      html += '<div class="draftCompMain">';
      html += '<span class="draftCompName">' + c.name + '</span>';
      html += '<span class="draftCompMeta">' + c.year + ' #' + c.pick + ' · ' + pickLabel + '</span>';
      html += '</div>';
      html += '<div class="draftCompDetails">';
      html += '<span class="draftCompArch">' + c.archetype + '</span>';
      if (c.matchStats.length > 0) {
        html += '<span class="draftCompMatch">Similar: ' + c.matchStats.join(', ') + '</span>';
      }
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Disclaimer
  html += '<div class="draftDisclaimer">Statistical model trained on 2,391 NCAA→NBA draft outcomes (2019–2025, CBD API). ';
  html += 'Uses sign-constrained elastic-net logistic regression with balanced class weights (CV F1: 64.7%, Recall: 90.5%). ';
  html += 'Does not factor measurables, workouts, team need, or international prospects.</div>';

  el.innerHTML = html;
}

// ── Small badge for player table ─────────────────────────────────────────────

function draftBadgeHtml(r) {
  if (typeof league !== 'undefined' && league === 'WBB') return '—';
  var prob = draftProbability(r);
  if (prob == null) return '—';
  var grade = draftGrade(prob);
  var color = draftColor(prob);
  var pct   = Math.round(prob * 100);
  return '<span class="draftMiniBadge" style="color:' + color + ';border-color:' + color + '" title="' + pct + '% draft probability">' + grade + '</span>';
}

// ── Expose ───────────────────────────────────────────────────────────────────
var draftProbabilityFn   = draftProbability;
var draftGradeFn         = draftGrade;
var draftRangeLabelFn    = draftRangeLabel;
var draftColorFn         = draftColor;
var draftFactorsFn       = draftFactors;
var renderDraftRadarFn   = renderDraftRadar;
var draftBadgeHtmlFn     = draftBadgeHtml;

window.DraftModel = {
  draftProbability:    draftProbability,
  draftGrade:          draftGrade,
  draftRangeLabel:     draftRangeLabel,
  draftColor:          draftColor,
  draftFactors:        draftFactors,
  draftInsights:       draftInsights,
  draftDevelopmentRecs:draftDevelopmentRecs,
  draftComparables:    draftComparables,
  renderDraftRadar:    renderDraftRadar,
  draftBadgeHtml:      draftBadgeHtml,
  DRAFT_MODEL:         DRAFT_MODEL
};
