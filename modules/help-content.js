(function () {
  'use strict';

  function withPage(pageId, steps, activeNavId) {
    return (steps || []).map(function (step) {
      var copy = {};
      Object.keys(step || {}).forEach(function (key) {
        copy[key] = step[key];
      });
      if (!copy.page) copy.page = pageId;
      if (activeNavId && !copy.activeNavId) copy.activeNavId = activeNavId;
      return copy;
    });
  }

  window.DashboardHelpContent = {
    fallback: {
      title: 'Dashboard Help',
      overview: 'Use the current page tour for a quick walkthrough, then open the full Methodology page if you want the deeper model details.',
      methodology: [
        {
          title: 'Tour This Page',
          body: 'Each help panel only tours the page you are on, so onboarding stays short and practical.'
        },
        {
          title: 'How This Page Works',
          body: 'The drawer summarizes the inputs, outputs, and caveats that matter for the current workflow.'
        }
      ],
      tourSteps: []
    },

    pagePlayers: {
      title: 'Players',
      overview: 'Use Players to rank the full pool, pressure-test your evaluation model, and jump into detailed player profiles.',
      methodology: [
        {
          title: 'PerfScore',
          body: 'PerfScore is a weighted percentile composite inside the selected Guards or Bigs bucket. Your weights drive the ranking immediately.'
        },
        {
          title: 'Valuation',
          body: 'Model value comes from your valuation settings, with minutes and conference adjustments layered onto the performance profile.'
        },
        {
          title: 'Position Buckets',
          body: 'Guards are only compared to guards and bigs are only compared to bigs, so percentiles stay role-aware.'
        },
        {
          title: 'Best Use',
          body: 'Treat this page as the scouting engine: tune the model here, then flow into Profiles, Team Builder, Portal, and Value Lab.'
        }
      ],
      tourSteps: withPage('pagePlayers', [
        {
          target: '#loadGs',
          title: 'Refresh Data',
          body: 'Reload the current season so your player pool, valuations, and derived outputs all stay aligned.'
        },
        {
          target: '#tabGuards',
          title: 'Position Groups',
          body: 'Switch between Guards and Bigs before you interpret percentiles or compare players.'
        },
        {
          target: '#fitPreset',
          title: 'Fit Presets',
          body: 'Preset philosophies are the fastest way to test how a different coaching lens changes the board.'
        },
        {
          target: '#playersBody',
          title: 'Player Table',
          body: 'The table is your live ranked board. Click any player row to open the full profile.'
        },
        {
          target: '#weightsCard',
          title: 'Weights',
          body: 'This is where the scoring model is tuned. Weight, min, max, and on/off changes re-rank the page instantly.'
        },
        {
          target: '#valuationCard',
          title: 'Valuation',
          body: 'This card sets the market anchors that turn model performance into dollar estimates.'
        }
      ])
    },

    pagePortal: {
      title: 'Transfer Portal',
      overview: 'Transfer Portal combines live portal tracking, player matching, fit recommendations, and AI follow-up in one scouting workflow.',
      methodology: [
        {
          title: 'Portal Sources',
          body: 'MBB can merge the live worker pipeline with the cached 247 snapshot flow. WBB currently uses the live On3 women’s portal source.'
        },
        {
          title: 'Player Matching',
          body: 'The board tries to match portal entrants back to loaded dashboard players so class, Perf, and value fields carry through.'
        },
        {
          title: 'Fit Lab',
          body: 'Recommendations compare a departing slot against portal options and rank replacements by fit, value, and profile gaps.'
        },
        {
          title: 'Best Use',
          body: 'Use Portal for live market scanning, then hand the shortlist to AI or Value Lab when you want the business lens.'
        }
      ],
      tourSteps: withPage('pagePortal', [
        {
          target: '#portalBoardSection',
          title: 'Portal Board',
          body: 'This table is the live board for entries, filters, match status, and direct profile access.'
        },
        {
          target: '#portalSearchInput',
          title: 'Search and Filters',
          body: 'Narrow the board quickly by player, team, or keywords before you commit to deeper scouting.'
        },
        {
          target: '#portalFitLabSection',
          title: 'Fit Lab',
          body: 'Pick your team, define the outgoing spot, and rank portal targets who solve that specific need.'
        },
        {
          target: '#portalAIAnalyzeBtn',
          title: 'Portal AI',
          body: 'Once you have a target pool, AI can explain the best picks, risks, and roster fit in plain language.'
        }
      ])
    },

    pageTeams: {
      title: 'Team Hub',
      overview: 'Team Hub is the real-team scouting workspace: load a team, study its identity, compare opponents, and launch deeper tools from there.',
      methodology: [
        {
          title: 'Real Team Context',
          body: 'Team Hub is anchored to actual teams and seasons, so efficiency, record context, and matchup outputs stay grounded.'
        },
        {
          title: 'DNA and Scout Cards',
          body: 'The page translates ratings, four factors, shot tendencies, and style tags into practical prep notes.'
        },
        {
          title: 'Comparison Workflow',
          body: 'Opponent comparison is strongest when you load both teams and let the matchup module line up their tendencies side by side.'
        },
        {
          title: 'Best Use',
          body: 'Use Team Hub for real-team prep, then open Team Builder for scenarios or Value Lab for the investment lens.'
        }
      ],
      tourSteps: withPage('pageTeams', [
        {
          target: '#thOpenBuilderBtn',
          title: 'Open Team Builder',
          body: 'Launch the scenario workspace from Team Hub instead of treating it like a separate top-level section.'
        },
        {
          target: '#thDNA',
          title: 'Team DNA',
          body: 'This card gives the quick read on efficiency, factors, scoring profile, and identity.'
        },
        {
          target: '#thScout',
          title: 'Scout Report',
          body: 'The auto-generated report turns the data into coaching-friendly strengths, weaknesses, and tactical notes.'
        },
        {
          target: '#thCompare',
          title: 'Team Comparison',
          body: 'Load an opponent here when you want side-by-side ratings and style differences.'
        },
        {
          target: '#thMatchup',
          title: 'Matchup View',
          body: 'Matchup analysis is where the head-to-head prep gets tactical, including deeper AI breakdowns.'
        }
      ])
    },

    pageTeamBuilder: {
      title: 'Team Builder',
      overview: 'Team Builder is the hypothetical roster workspace inside Team Hub. Use it for scenarios, gap analysis, and opponent modeling.',
      methodology: [
        {
          title: 'Scenario Tool',
          body: 'Team Builder is intentionally separate from real-team analysis so you can test what-if roster ideas without touching Team Hub.'
        },
        {
          title: 'Roster Constraints',
          body: 'Budget, player cap, and roster slots create guardrails so the scenario stays realistic.'
        },
        {
          title: 'Gap Analysis',
          body: 'The stat profile highlights weak categories, then recommended fits try to solve those gaps.'
        },
        {
          title: 'Best Use',
          body: 'Build scenarios here, then export the business view into Value Lab when you want to judge spend versus outcome.'
        }
      ],
      tourSteps: withPage('pageTeamBuilder', [
        {
          target: '#tbQuickAddInput',
          title: 'Quick Add',
          body: 'Search the full player pool and add scenario pieces quickly without leaving the page.'
        },
        {
          target: '#tbStatProfile',
          title: 'Team Stat Profile',
          body: 'This profile summarizes how the scenario roster grades across key categories and shows where the build is thin.'
        },
        {
          target: '#tbSubH2H',
          title: 'Head-to-Head',
          body: 'Use Head-to-Head once both rosters are built and you want a category-by-category matchup read.'
        },
        {
          target: '#tbSubOpponent',
          title: 'Opponent Builder',
          body: 'Build the opponent roster here when you want more realistic H2H prep.'
        }
      ], 'pageTeams')
    },

    pageValueLab: {
      title: 'Value Lab',
      overview: 'Value Lab is the business-side roster investment workspace. Build named cases, track real spend, and judge bang-for-buck.',
      methodology: [
        {
          title: 'Case Budget',
          body: 'Budget is the roster cap for the case. The page tracks how much is committed and how much room the case still has.'
        },
        {
          title: 'Actual Spend vs Model Value',
          body: 'Model value is your internal market estimate. Actual spend lets you compare what the contract really cost against that model.'
        },
        {
          title: 'ROI Call',
          body: 'ROI tags classify each contract from Steal to Overpay by comparing performance against the spend basis.'
        },
        {
          title: 'Outcome Lens',
          body: 'Outcome vs Spend estimates what this budget and roster profile are buying in terms of projected team performance.'
        },
        {
          title: 'Compare Mode',
          body: 'Use Compare against to stack the active case next to another saved case, surface a recommendation pill, and see which roster gives you the cleaner spend, projected wins, and budget flexibility.'
        }
      ],
      tourSteps: withPage('pageValueLab', [
        {
          target: '#valueLabControlsSection',
          title: 'Case Controls',
          body: 'Create, save, duplicate, and populate independent Value Lab cases here.'
        },
        {
          target: '#valueLabKpisSection',
          title: 'Executive KPIs',
          body: 'These cards summarize spend, budget health, value efficiency, and the top-level business picture.'
        },
        {
          target: '#valueLabCompareSection',
          title: 'Case Comparison',
          body: 'Compare the active case against another saved case to see the tradeoffs in wins, budget room, efficiency, and roster changes.'
        },
        {
          target: '#valueLabOutcomeSection',
          title: 'Outcome vs Spend',
          body: 'This section translates the roster investment picture into projected team outcome context.'
        },
        {
          target: '#valueLabAISection',
          title: 'Director AI Brief',
          body: 'AI explains whether the roster is financially healthy, compares two cases when selected, and can export the director brief to PDF.'
        }
      ])
    },

    pageMethodology: {
      title: 'Methodology',
      overview: 'Methodology is the deep reference page for the dashboard. Use the drawer for quick page help and this page for the full formulas, sources, and caveats behind scouting, portal, value, and tournament outputs.',
      methodology: [
        {
          title: 'Deep Reference',
          body: 'This page is where the full formulas, modeling choices, and source caveats live.'
        },
        {
          title: 'Player and Portal Logic',
          body: 'PerfScore, valuation, position buckets, portal matching, and enrichment choices are documented here.'
        },
        {
          title: 'Value and Tournament Logic',
          body: 'Value Lab investment logic, simulation methodology, and bracket-model context live here too.'
        }
      ],
      tourSteps: withPage('pageMethodology', [
        {
          target: '#methodDataSourcesSection',
          title: 'Data Sources',
          body: 'Start here when you need to confirm which systems feed MBB, WBB, and enrichment logic.'
        },
        {
          target: '#methodPerfScoreSection',
          title: 'PerfScore',
          body: 'This section explains how the player model is built from weighted percentile inputs.'
        },
        {
          target: '#methodValuationSection',
          title: 'Valuation',
          body: 'Use the valuation section when you need the exact logic behind market estimates.'
        },
        {
          target: '#methodMonteCarloSection',
          title: 'Simulation Logic',
          body: 'Monte Carlo and other team-level modeling notes live here for the deeper read.'
        }
      ])
    },

    pageLab: {
      title: 'Tournament Lab',
      overview: 'Tournament Lab is the field-level analytics workspace. Use it for team set analysis before you jump into bracket simulation.',
      methodology: [
        {
          title: 'Field View',
          body: 'Tournament Lab looks across the selected field or sample of teams, not one single roster.'
        },
        {
          title: 'Pattern Detection',
          body: 'The page clusters DNA, tendencies, shot profile, and predictive signals to find similarities and separators.'
        },
        {
          title: 'War Room Split',
          body: 'Bracket simulation lives in Tournament War Room so the bracket workflow does not overload the analytics page.'
        }
      ],
      tourSteps: withPage('pageLab', [
        {
          target: '#labWarRoomLauncherSection',
          title: 'Tournament War Room',
          body: 'Launch the bracket simulator from here when you are ready to build or test a field.'
        },
        {
          target: '#labPickerSection',
          title: 'Field Controls',
          body: 'Load the teams you want to study before you interpret the downstream charts.'
        },
        {
          target: '#labCommonDNASection',
          title: 'Common DNA',
          body: 'Common DNA highlights the traits the loaded group shares.'
        },
        {
          target: '#labPredictorSection',
          title: 'Predictor',
          body: 'The predictor section surfaces signals that separate stronger tournament profiles from weaker ones.'
        },
        {
          target: '#labDeepAnalysisSection',
          title: 'Deep Analysis',
          body: 'Use the deep analysis block when you want a more narrative read on the loaded tournament set.'
        }
      ])
    },

    pageWarRoom: {
      title: 'Tournament War Room',
      overview: 'Tournament War Room is the bracket workspace. Build the field, fill play-ins, run simulations, and review the bracket-specific AI output.',
      methodology: [
        {
          title: 'Bracket Input',
          body: 'Fill the bracket structure or load a preset before running the simulation. Play-in pairs count as one slot and resolve first.'
        },
        {
          title: 'Simulation',
          body: 'The engine runs repeated matchup simulations round by round, then stores advancement odds across the bracket.'
        },
        {
          title: 'Best Use',
          body: 'Use War Room after Tournament Lab. Lab helps you study the field, while War Room helps you test bracket paths.'
        }
      ],
      tourSteps: withPage('pageWarRoom', [
        {
          target: '#warRoomBoardSection',
          title: 'Bracket Board',
          body: 'This is the main bracket canvas where you place teams and see the projected path.'
        },
        {
          target: '#warRoomToolsSection',
          title: 'Bracket Tools',
          body: 'Use these controls to load presets, set play-ins, and run the bracket simulation.'
        },
        {
          target: '#warRoomAnalysisSection',
          title: 'Results and AI',
          body: 'Once a sim runs, review the results here and use the AI output for narrative context.'
        }
      ], 'pageLab')
    },

    pageFavorites: {
      title: 'Favorites',
      overview: 'Favorites is the saved-target workspace for players, folders, and portal watch alerts.',
      methodology: [
        {
          title: 'Saved Targets',
          body: 'Favoriting lets coaches and analysts keep a curated target board without rebuilding searches every time.'
        },
        {
          title: 'Folders',
          body: 'Folders are the simplest way to segment portal needs, positional targets, or staff-owned lists.'
        },
        {
          title: 'Portal Alerts',
          body: 'Portal watch alerts light up when a saved player enters the portal, giving your staff a faster signal.'
        }
      ],
      tourSteps: withPage('pageFavorites', [
        {
          target: '#favsHeaderSection',
          title: 'Favorites Overview',
          body: 'Start here for the saved-player count, status, and top-level view of your board.'
        },
        {
          target: '#favsToolsSection',
          title: 'Folders and Alerts',
          body: 'This section combines folder organization with live portal watch context.'
        },
        {
          target: '#favsResultsSection',
          title: 'Saved Board',
          body: 'The results area is where the actual favorite list lives for review, filtering, and next actions.'
        }
      ])
    },

    pageCollaborate: {
      title: 'Collaborate',
      overview: 'Collaborate is the shared messaging workspace for staff notes, threads, and dashboard context.',
      methodology: [
        {
          title: 'Threaded Collaboration',
          body: 'Use this page when the work needs to be shared across staff instead of kept inside one local flow.'
        },
        {
          title: 'Context',
          body: 'The page is most useful when the discussion stays tied to a scouting task, target list, or planning decision.'
        }
      ],
      tourSteps: withPage('pageCollaborate', [
        {
          target: '#chatSidebar',
          title: 'Conversation List',
          body: 'The sidebar organizes the active threads and helps you jump between conversations quickly.'
        },
        {
          target: '#chatMain',
          title: 'Active Thread',
          body: 'The main panel is where the current discussion and collaboration context live.'
        }
      ])
    },

    pageAdmin: {
      title: 'Admin',
      overview: 'Admin is the internal operations panel for account approvals, user management, and password resets.',
      methodology: [
        {
          title: 'Account Requests',
          body: 'New accounts are requested first and must be approved here before they can sign in.'
        },
        {
          title: 'User Management',
          body: 'Existing accounts can be reviewed, deleted, or reset from this panel.'
        },
        {
          title: 'Internal Workflow',
          body: 'This page is intentionally lightweight because the dashboard is an internal tool, not a public app.'
        }
      ],
      tourSteps: withPage('pageAdmin', [
        {
          target: '#adminRefreshBtn',
          title: 'Refresh',
          body: 'Refresh the admin panel when you need the latest request and user state.'
        },
        {
          target: '#adminRequestBody',
          title: 'Pending Requests',
          body: 'Approve or reject new account requests from this table.'
        },
        {
          target: '#adminUsersBody',
          title: 'Existing Users',
          body: 'Manage existing users here, including password resets and account removal.'
        }
      ])
    }
  };
})();
