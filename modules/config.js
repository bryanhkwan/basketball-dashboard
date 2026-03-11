// ============ CONFIG MODULE ============
// Dependencies: none
// Contains: utility functions, all constants, glossary data

// --- Utility functions (global) ---

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x, 0, 1);
const fmtMoney = (n) => Number.isFinite(n) ? n.toLocaleString(undefined, {style:'currency', currency:'USD', maximumFractionDigits:0}) : '—';
const safeNum = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

// Convert Google Sheets AOA (array-of-arrays) into row objects using header row.
function aoaToObjects(aoa){
  if(!aoa || !aoa.length) return [];
  const headers = (aoa[0]||[]).map(h => String(h||'').trim());
  const rows = [];
  for(let i=1;i<aoa.length;i++){
    const obj = {};
    const row = aoa[i]||[];
    for(let j=0;j<headers.length;j++){
      const key = headers[j];
      if(!key) continue;
      obj[key] = row[j];
    }
    if(Object.keys(obj).length) rows.push(obj);
  }
  return rows;
}

// Unified sheet->AOA for both XLSX worksheets and Google AOA sheets
function sheetToAoa(ws){
  if(!ws) return [];
  if(ws.__aoa) return ws.__aoa;
  if(typeof XLSX !== 'undefined' && XLSX?.utils?.sheet_to_json){
    return XLSX.utils.sheet_to_json(ws, {header:1});
  }
  return [];
}

// Returns array of row-objects (header-keyed) for either source
function sheetToJson(ws){
  if(!ws) return [];
  if(ws.__aoa) return aoaToObjects(ws.__aoa);
  if(typeof XLSX !== 'undefined' && XLSX?.utils?.sheet_to_json){
    return XLSX.utils.sheet_to_json(ws);
  }
  return [];
}

// Percent stats are already stored as decimals (e.g., 0.38 for 38%) in the spreadsheet.
function scalePct(stat, x){ return x; }

// percentile (inclusive) like Excel PERCENTILE.INC
function percentileInc(arr, p){
  const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(a.length === 0) return NaN;
  const n = a.length;
  const r = (n - 1) * p + 1;
  const k = Math.floor(r);
  const d = r - k;
  if(k <= 1) return a[0];
  if(k >= n) return a[n-1];
  return a[k-1] + d * (a[k] - a[k-1]);
}

// percentile rank (0..1): fraction <= x
function percentileRank(sortedAsc, x){
  if(!sortedAsc?.length || !Number.isFinite(x)) return NaN;
  let lo = 0, hi = sortedAsc.length;
  while(lo < hi){
    const mid = (lo + hi) >> 1;
    if(sortedAsc[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedAsc.length;
}

function extractSpreadsheetId(url){
  if(!url) return null;
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

function deepClone(obj){
  return JSON.parse(JSON.stringify(obj));
}

// --- Constants ---

const DEFAULT_GS_URL = 'https://docs.google.com/spreadsheets/d/1dDphHKY2lIs1T88TKo6f3n7oUccc4dVYmMlF2Rk1mFk/edit?usp=sharing';
const DEFAULT_GS_API_KEY = 'AIzaSyAfcKSySow-TBS1uZNHrQX4oc_uiUWwvq8';

const SHEET_MAP = {
  MBB: 'Men Data',
  WBB: 'Women Data'
};

const PAGE_SIZE = 200;

const FIT_PRESETS = {
  balanced: { 'PPG':1, 'eFG%':1, '3P%':0.7, 'FT%':0.6, 'APG':0.9, 'A/TO':0.8, 'SPG':0.7, 'BPG':0.5, 'RPG':0.6, 'DRtg':0.8, 'BPM':1, 'USG%':0.4, 'WS/40':0.8 },
  shooting: { 'eFG%':1.3, '3P%':1.3, 'FT%':0.9, 'PPG':0.8, 'TS%':1.0 },
  playmaking: { 'APG':1.3, 'A/TO':1.2, 'AST%':1.0, 'PPG':0.6 },
  defense: { 'DRtg':1.3, 'SPG':1.0, 'BPG':1.0, 'STL%':0.8, 'BLK%':0.8 },
  rim: { 'BPG':1.5, 'BLK%':1.2, 'DRtg':1.0, 'RPG':0.8 },
  rebounding: { 'RPG':1.3, 'ORB/G':1.0, 'DRB/G':1.0, 'TRB%':0.9 }
};

const GUARD_DEFAULTS = [
  {stat:'PPG', w:10, min:0, max:30, dir:'higher'},
  {stat:'eFG%', w:10, min:0.35, max:0.60, dir:'higher'},
  {stat:'3P%', w:8, min:0.25, max:0.42, dir:'higher'},
  {stat:'FT%', w:5, min:0.60, max:0.90, dir:'higher'},
  {stat:'APG', w:10, min:0.5, max:7, dir:'higher'},
  {stat:'A/TO', w:8, min:0.5, max:2.5, dir:'higher'},
  {stat:'SPG', w:7, min:0.3, max:2.0, dir:'higher'},
  {stat:'BPM', w:10, min:-3, max:8, dir:'higher'},
  {stat:'WS/40', w:8, min:0.05, max:0.25, dir:'higher'},
  {stat:'DRtg', w:7, min:115, max:90, dir:'lower'},
  {stat:'USG%', w:5, min:12, max:32, dir:'higher'},
  {stat:'RPG', w:5, min:1, max:7, dir:'higher'},
  {stat:'TOPG', w:7, min:3.5, max:0.5, dir:'lower'},
];

const BIG_DEFAULTS = [
  {stat:'PPG', w:10, min:0, max:25, dir:'higher'},
  {stat:'eFG%', w:10, min:0.40, max:0.65, dir:'higher'},
  {stat:'FT%', w:5, min:0.55, max:0.85, dir:'higher'},
  {stat:'BPG', w:9, min:0.2, max:2.5, dir:'higher'},
  {stat:'RPG', w:10, min:2, max:12, dir:'higher'},
  {stat:'OR%', w:7, min:8, max:30, dir:'higher'},
  {stat:'DR%', w:7, min:10, max:25, dir:'higher'},
  {stat:'DRtg', w:8, min:115, max:90, dir:'lower'},
  {stat:'BPM', w:10, min:-3, max:8, dir:'higher'},
  {stat:'WS/40', w:8, min:0.05, max:0.25, dir:'higher'},
  {stat:'A/TO', w:6, min:0.3, max:2.0, dir:'higher'},
  {stat:'USG%', w:5, min:12, max:32, dir:'higher'},
  {stat:'TOPG', w:5, min:3.5, max:0.5, dir:'lower'},
];

const ROLE_DESCRIPTIONS = {
  "Shooter": "Elite perimeter threat. Strong 3P% that bends the defense and creates spacing.",
  "Efficient": "Scores with high efficiency (shot quality + finishing). Converts possessions into points at an above-average rate.",
  "Scorer": "Primary offensive producer. Creates points through shot volume and/or shot creation ability.",
  "Playmaker": "Creates offense for teammates through assists, decision-making, and ball movement.",
  "Low TO": "Protects possessions and makes smart decisions with the ball. Minimizes turnovers relative to usage.",
  "Disruptor": "Creates defensive events — steals/deflections/pressure that disrupts actions and generates transition chances.",
  "Defender": "Reliable defensive contributor. Strong defensive impact indicators (e.g., DR% / on-ball pressure proxies).",
  "Impact": "Overall positive influence on winning across efficiency and impact metrics (e.g., BPM / two-way value).",
  "Role Player": "Dependable contributor who supports team structure with effort and situational strengths.",
  "Rim Protector": "Protects the paint. Deterrs shots at the rim and blocks/contests effectively (high BPG percentile).",
  "Rebounder": "Controls the glass on defense (and sometimes overall). Ends possessions and creates second-chance chances.",
  "Anchor Defender": "Backline defensive organizer. Strong team-defense impact indicators (e.g., elite DRtg percentile).",
  "Efficient Finisher": "High-efficiency scorer around the rim (and on limited touches). Converts looks into points (high eFG% percentile).",
  "Extra Possessions": "Creates additional chances via offensive rebounding and hustle plays (high OR% percentile).",
  "Stretch Big": "Big who spaces the floor. Credible 3PT threat that pulls rim protection away from the paint.",
  "Frontcourt Role": "Role-oriented big. Provides minutes/physicality/screens/rebounding/defense without a standout single elite tag."
};

const STAT_GLOSSARY = {
  'G': 'Games Played. Number of games a player appeared in during the season.',
  'MP': 'Minutes Per Game. Average minutes played per game. Used to derive the minutes multiplier in valuation — higher MP signals a larger role.',
  'PPG': 'Points per game. Overall scoring volume (pace/role dependent).',
  'FG%': 'Field Goal Percentage. Share of all 2PT+3PT shots made. Doesn\'t account for 3PT value.',
  '3P%': 'Three-Point Percentage. Share of 3PT shots made. Indicates spacing / shooting skill.',
  '3PA/G': 'Three-Point Attempts per game. Volume of 3PT shots; higher indicates more perimeter usage.',
  '2P%': 'Two-Point Percentage. Share of 2PT shots made. Complements 3P% for overall field goal efficiency.',
  'FT%': 'Free Throw Percentage. Share of free throws made. Proxy for touch/shooting.',
  'APG': 'Assists per game. Passing/playmaking volume (role dependent).',
  'TOPG': 'Turnovers per game. Ball security; lower is better.',
  'A/TO': 'Assist-to-turnover ratio. Passing efficiency & decision-making; higher is better.',
  'RPG': 'Rebounds per game. Combines offensive and defensive rebounding volume; higher is better.',
  'ORB/G': 'Offensive rebounds per game. Extra possessions created; higher is better.',
  'DRB/G': 'Defensive rebounds per game. Ends opponent possessions; higher is better.',
  'BPG': 'Blocks per game. Rim protection / deterrence; higher is better.',
  'SPG': 'Steals per game. Disruption / forcing turnovers; higher is better.',
  'eFG%': 'Effective FG%. Adjusts FG% by giving 3PT extra value: (FGM + 0.5×3PM) / FGA. Values stored as decimals (e.g. 0.52 = 52%).',
  'TS%': 'True Shooting Percentage. Most complete shooting efficiency measure: Points / (2 × (FGA + 0.44×FTA)). Higher is better. Stored as a decimal (e.g. 0.57 = 57%).',
  'OR%': 'Offensive Rebound %. Percent of available offensive rebounds a player secures while on court. Stored as a whole-number percent (e.g. 8.2 = 8.2%). Scale: ~3 (average) to 15 (elite).',
  'DR%': 'Defensive Rebound %. Percent of available defensive rebounds a player secures while on court. Stored as a whole-number percent (e.g. 18 = 18%). Scale: ~10 (average) to 25 (elite). Note: not available from the MBB API — populated from Google Sheets (WBB) or left blank.',
  'TRB%': 'Total Rebound Percentage. Percent of available rebounds (offensive + defensive) a player gets while on court.',
  'WS': 'Win Shares. Estimated wins contributed (context/team dependent).',
  'WS/40': 'Win Shares per 40 minutes. Per-minute win contributions; accounts for playing time. Scale: 0.05 (average) to 0.25+ (elite). Higher is better.',
  'OWS': 'Offensive Win Shares. Estimated wins contributed on the offensive end.',
  'DWS': 'Defensive Win Shares. Estimated wins contributed on the defensive end.',
  'ORtg': 'Offensive Rating. Points produced per 100 possessions on offense (higher is better). Typical range: 90–130.',
  'DRtg': 'Defensive Rating. Points allowed per 100 possessions while on court; lower is better. Typical range: 90–115.',
  'BPM': 'Box Plus/Minus (proxy). In this dashboard, BPM is populated from PORPAG via the College Basketball Data API. See PORPAG for full definition. Scale: −3 (below average) to 8+ (elite). Higher is better.',
  'PORPAG': 'Points Over Replacement Per Adjusted Game. Proprietary metric from the College Basketball Data API. Measures per-game impact relative to a replacement-level player — conceptually similar to Box Plus/Minus. Used as the BPM proxy in this dashboard. Scale: ~ −3 to 8+; higher is better.',
  'PER': 'Player Efficiency Rating. Box-score efficiency measure (higher is better).',
  'USG%': 'Usage Percentage. Percent of team possessions a player uses (via FGA, FTA, or TOV) while on court. Stored as a whole-number percent (e.g. 22.5 = 22.5%). Scale: 12 (role player) to 32 (primary option).',
  'AST%': 'Assist Percentage. Percent of teammate FGs a player assisted on while on court; higher is more playmaking.',
  'STL%': 'Steal Percentage. Percent of opponent possessions that end in a steal when player is on court; higher is more disruptive.',
  'BLK%': 'Block Percentage. Percent of opponent 2PT attempts blocked when player is on court; higher is more rim protection.',
  'TOV%': 'Turnover Percentage. Percent of possessions that end in a turnover; lower is better.',
  'MPG': 'Minutes per game. Average playing time; higher means more opportunity and impact potential.',
  'OBPM': 'Offensive Box Plus/Minus. Per-100-possession offensive impact vs average player (higher is better).',
  'DBPM': 'Defensive Box Plus/Minus. Per-100-possession defensive impact vs average player (higher is better).',
  '3PT_Rating': 'Three-Point Rating. Composite 3PT value: (3P% × vol_factor × games_factor). vol_factor = min(1, 3PA/G ÷ 2) — rewards players attempting 2+ per game. games_factor = min(1, G ÷ 10) — requires at least 10 games of evidence. Prevents inflated ratings from small samples or low volume.',
};

const DEFAULT_DIR = {
  'TOPG':'lower', 'TOV/G':'lower',
  'DRtg':'lower', 'DRTG':'lower', 'DRTG.':'lower', 'DRTg':'lower',
  'TOV':'lower', 'TOV%':'lower', 'TO':'lower',
  'Fouls':'lower', 'PF':'lower', 'PF/G':'lower',
  'Opp PPG':'lower',
  '+/-':'higher',
  'USG%':'higher',
};

const CONF_DISPLAY_ORDER = [
  'Big 12','SEC','Big Ten','ACC','Big East',
  'American','Mountain West','Atlantic 10','WCC','Pac-12',
  'Missouri Valley','CUSA','MAC','Sun Belt',
  'CAA','Ivy League','Big West','Summit League',
  'Horizon League','America East','Southern',
  'ASUN','MAAC','OVC','WAC','Patriot League',
  'Big Sky','Southland','NEC','SWAC','MEAC',
  'Big South','Independent','NE10'
];

const DEFAULT_CONF_VALUES = {
  'Big 12':1.08,'SEC':1.07,'Big Ten':1.07,'ACC':1.06,'Big East':1.06,
  'American':1.05,'Mountain West':1.05,'Atlantic 10':1.04,'WCC':1.04,'Pac-12':1.03,
  'Missouri Valley':1.03,'CUSA':1.03,'MAC':1.00,'Sun Belt':1.01,
  'CAA':1.00,'Ivy League':1.00,'Big West':0.99,'Summit League':0.99,
  'Horizon League':0.99,'America East':0.98,'Southern':0.98,
  'ASUN':0.97,'MAAC':0.97,'OVC':0.96,'WAC':0.96,'Patriot League':0.96,
  'Big Sky':0.96,'Southland':0.95,'NEC':0.94,'SWAC':0.93,'MEAC':0.93,
  'Big South':0.94,'Independent':1.00,'NE10':0.90
};

const CONF_ALIASES = {
  // Pac-12
  'Pac 12':'Pac-12','Pacific-12':'Pac-12','PAC-12':'Pac-12','Pacific 12':'Pac-12',
  // Mountain West
  'Mountain We':'Mountain West','MWC':'Mountain West',
  // Atlantic 10
  'A-10':'Atlantic 10','A10':'Atlantic 10',
  // WCC
  'West Coast':'WCC','West Coast Conference':'WCC',
  // AAC
  'AAC':'American','American Athletic':'American','American Athletic Conference':'American',
  // Missouri Valley
  'Missouri Vall':'Missouri Valley','MVC':'Missouri Valley',
  // Conference USA
  'C-USA':'CUSA','Conference USA':'CUSA',
  // Ivy League
  'Ivy':'Ivy League',
  // Summit League
  'Summit Leag':'Summit League','The Summit League':'Summit League',
  // Horizon League
  'Horizon Leag':'Horizon League',
  // America East
  'America Eas':'America East','AE':'America East',
  // Southern / SoCon
  'SoCon':'Southern','Southern Conference':'Southern',
  // ASUN
  'A-Sun':'ASUN','Atlantic Sun':'ASUN',
  // OVC
  'Ohio Valley':'OVC','OVC Conference':'OVC',
  // Patriot League
  'Patriot Leag':'Patriot League','Patriot':'Patriot League',
  // NEC
  'Northeast':'NEC','Northeast Conference':'NEC',
  // NE10
  'NE-10':'NE10','Northeast-10':'NE10',
  // Big Sky
  'Big Sky Conference':'Big Sky',
  // Big South
  'Big South Conference':'Big South',
  // Southland
  'Southland Conference':'Southland',
  // CAA
  'Colonial':'CAA','Colonial Athletic':'CAA','Colonial Athletic Association':'CAA',
  // SEC
  'Southeastern':'SEC','Southeastern Conference':'SEC',
  // Big Ten
  'Big 10':'Big Ten',
};

// Gap analysis stat categories
const GAP_CATEGORIES = {
  Guards: [
    {label:'Scoring', stats:['PPG'], icon:'🏀'},
    {label:'Shooting', stats:['3P%','eFG%'], icon:'🎯'},
    {label:'Free throws', stats:['FT%'], icon:'📏'},
    {label:'Playmaking', stats:['APG','A/TO'], icon:'🎯'},
    {label:'Ball security', stats:['TOPG'], icon:'🔒'},
    {label:'Steals', stats:['SPG'], icon:'🖐️'},
    {label:'Defense', stats:['DRtg','DR%'], icon:'🛡️'},
    {label:'Impact', stats:['BPM','WS/40'], icon:'📈'},
  ],
  Bigs: [
    {label:'Scoring', stats:['PPG'], icon:'🏀'},
    {label:'Efficiency', stats:['eFG%','FG%'], icon:'🎯'},
    {label:'Free throws', stats:['FT%'], icon:'📏'},
    {label:'Rim protection', stats:['BPG'], icon:'🚫'},
    {label:'Off. rebounding', stats:['OR%'], icon:'💪'},
    {label:'Def. rebounding', stats:['DR%'], icon:'🛡️'},
    {label:'Steals', stats:['SPG'], icon:'🖐️'},
    {label:'Defense', stats:['DRtg'], icon:'🛡️'},
    {label:'Impact', stats:['BPM','WS/40'], icon:'📈'},
  ]
};

// Plain-English explanations for each stat category
const GAP_EXPLANATIONS = {
  'Scoring': 'Points per game (PPG). How many points your players put up on average. A weak score here means your team may struggle to keep up on the scoreboard.',
  'Shooting': 'Three-point percentage (3P%) and effective field goal percentage (eFG%). Measures how efficiently your team shoots from the field, especially from beyond the arc. Weak shooting means missed open looks and lower offensive output.',
  'Free throws': 'Free throw percentage (FT%). How reliable your team is at the foul line. Weak free throw shooting loses you easy points, especially in close games.',
  'Playmaking': 'Assists per game (APG) and assist-to-turnover ratio (A/TO). How well your guards create scoring opportunities for teammates. Weak playmaking means too much iso ball and predictable offense.',
  'Ball security': 'Turnovers per game (TOPG — lower is better). How often your team gives the ball away. Weak ball security means your opponents get free possessions and easy fast-break points.',
  'Steals': 'Steals per game (SPG). Your team\'s ability to force turnovers and create extra possessions. More steals = more transition scoring opportunities.',
  'Defense': 'Defensive rating (DRtg — lower is better) and defensive rebound percentage (DR%). How many points your team allows per 100 possessions. Weak defense means opponents score easily against you.',
  'Impact': 'Box Plus/Minus (BPM) and Win Shares per 40 minutes (WS/40). Overall player impact — combines offense and defense into one number. Weak impact means your players aren\'t moving the needle in games.',
  'Efficiency': 'Effective field goal % (eFG%) and field goal % (FG%). How well your bigs convert their shot attempts. Weak efficiency means wasted possessions around the rim.',
  'Rim protection': 'Blocks per game (BPG). Your bigs\' ability to protect the paint and deter drives. Weak rim protection means opponents get easy layups and dunks.',
  'Off. rebounding': 'Offensive rebound percentage (OR%). How often your team grabs their own misses for second-chance points. Weak offensive rebounding means one-and-done possessions.',
  'Def. rebounding': 'Defensive rebound percentage (DR%). How well your team secures boards after opponent misses. Weak defensive rebounding gives opponents extra shots at the basket.',
};

// --- Class wrapper (organizational) ---
class Config {
  get SHEET_MAP(){ return SHEET_MAP; }
  get DEFAULT_GS_URL(){ return DEFAULT_GS_URL; }
  get DEFAULT_GS_API_KEY(){ return DEFAULT_GS_API_KEY; }
  get FIT_PRESETS(){ return FIT_PRESETS; }
  get GUARD_DEFAULTS(){ return GUARD_DEFAULTS; }
  get BIG_DEFAULTS(){ return BIG_DEFAULTS; }
  get ROLE_DESCRIPTIONS(){ return ROLE_DESCRIPTIONS; }
  get STAT_GLOSSARY(){ return STAT_GLOSSARY; }
  get DEFAULT_DIR(){ return DEFAULT_DIR; }
  get CONF_DISPLAY_ORDER(){ return CONF_DISPLAY_ORDER; }
  get DEFAULT_CONF_VALUES(){ return DEFAULT_CONF_VALUES; }
  get CONF_ALIASES(){ return CONF_ALIASES; }
  get GAP_CATEGORIES(){ return GAP_CATEGORIES; }
  get GAP_EXPLANATIONS(){ return GAP_EXPLANATIONS; }
  get PAGE_SIZE(){ return PAGE_SIZE; }
}

window.Config = new Config();
