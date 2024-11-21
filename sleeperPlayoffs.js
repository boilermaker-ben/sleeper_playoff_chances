// SLEEPER PLAYTOFFS CALCUATION
// V 1.0
// 11/21/2024
// 
// Run with `node --max-old-space-size=8192 sleeperPlayoffs.js` (or whatever memory size you'd like to allocated)
// 
(async () => {

    const abbrev = 'YOUR_LEAGUE';
  
    sleeperPlayoffsCalculation(2024, 12, abbrev);
    
    const sleeperURL = 'https://api.sleeper.app/v1/league/';
    // LEAGUE IDS - fixed values for league ID lookup, based on stored object; takes a required input of league abbreviation and optional year or array/all/full/complete/object
    async function leagues(league) {
        const data =
        {
            'YOUR_LEAGUE': '12312435435235643' <=== ENTER YOUR LEAGUE ID HERE AND CHANGE "LEAGUE" IF DESIRED"
        };
        return data[league];
    }
    const start = Date.now();

    //==============================================================================
    // SLEEPER PLAYOFFS MASTER FUNCTION
    async function sleeperPlayoffsCalculation(year, week, leagueAbbrev) {
        leagueAbbrev = leagueAbbrev == null ? abbrev : leagueAbbrev;
        week = week == null ? week = seasonInfo('week') : week; // This will use the active week as the starting week for the playoff calculations (most useful)
        // let complete = week < activeWeek ? true : false;

        // Fetch league ID (dependent async function in "globals" scripts)
        const league = await leagues(leagueAbbrev);

        // Gathers league data, wins, points, weekly points, division (if applicable), etc
        const leagueObj = await sleeperPlayoffsLeagueData(league, week);
        let data = leagueObj.data;
        let settings = leagueObj.settings;
        // Append some keys to the settings object

        console.log('Gathered league data for ' + leagueAbbrev + '. Remaining matchups before playoffs: ' + settings.remaining);

        // Gathers all matchups and outputs a "combinations" and a blank "outcomes" array for all regular season weeks
        const matchups = await sleeperPlayoffsMatchups(league, data, week, settings.playoffStart, settings.teams);

        // Creates all possible combinations of winning teams for the remaining weeks
        let unique = (2 ** (settings.teams / 2));
        let text = 'Gathered matchups for week' + (matchups.weeks.length > 1 ? '(s)' : null) + ' ' + matchups.weeks;
        if ((unique > 32 && settings.remaining > 3) || (unique > 16 && settings.remaining > 5)) {
            text = text.concat(' (' + unique + ' combinations per week over ' + settings.remaining + ' weeks will result in a long computational time)')
        }
        console.log(text); // Report on possible outcomes

        const arr = await sleeperPlayoffsRoutes(matchups, settings);
        console.log('Created array of all outcomes: ' + arr.length.toLocaleString());

        let size = 1200000;
        let index = 0;
        let count = parseInt(Math.ceil(arr.length / size));
        let remaining = count - 1;
        let current = 1;
        let playoffs = [];
        if (arr.length > size) {
            while (index < arr.length) {
                const startPaths = Date.now();
                const partial = arr.slice(index, index + size);
                console.log('Iterating chunk ' + current + ' of ' + count + '...');
                const obj = await sleeperPlayoffsPaths(data, partial, settings);
                data = obj.data;
                playoffs = playoffs.concat(obj.playoffScenarios);
                index += size;
                const endPaths = Date.now();
                const total = (endPaths - startPaths) / 1000;
                const remainingTime = parseFloat((total * remaining).toFixed(2));
                console.log('Completed chunk ' + current + ', ' + remaining + ' arrays left, approximately ' + remainingTime + ' seconds of path processing remaining');
                current++;
                remaining--;
            }
        } else {
            const pathProcessing = await sleeperPlayoffsPaths(data, arr, settings);
            data = pathProcessing.data;
            qualifiers = pathProcessing.qualifiers;
            playoffScenarios = pathProcessing.playoffScenarios;
            byeQualifiers = pathProcessing.byeQualifiers;
            byeScenarios = pathProcessing.byeScenarios;
        }
        // }

       
        text = 'Done projecting outcomes from week ' + week + ' to ' + matchups.finalWeek + ' for ' + leagueAbbrev + '.';
        console.log(text);
        await sleeperScenarioEvaluations(data, arr, playoffScenarios, qualifiers, settings, 'playoff');
        let objectByeEvaluation = {};
        if (settings.byes > 0) {
            await sleeperScenarioEvaluations(data, arr, byeScenarios, byeQualifiers, settings, 'bye');
        }
        
        const end = Date.now();
        console.log(`Script runtime: ${(end - start) / 1000} seconds`);
       
        const fs = require('fs');
        fs.writeFileSync(year + '_' + week + '_' + leagueAbbrev + '_playoff_calc.txt', JSON.stringify(data, null, 2));
        console.log('Output written to ' +year + '_' + week + '_' + leagueAbbrev + '_playoff_calc.txt');
        
        const table = sleeperPlayoffsJsonToCsv(data);
        fs.writeFileSync(year + '_' + week + '_' + leagueAbbrev + '_playoff_calc.csv', table);
        console.log('Output written to ' +year + '_' + week + '_' + leagueAbbrev + '_playoff_calc.csv');

    }

    //
    //==============================================================================
    // SLEEPER PLAYOFFS LEAGUE DATA
    async function sleeperPlayoffsLeagueData(league, week) {
        let info = await leagueInfo(league, ['names', 'divisions', 'teams', 'usernames_by_roster', 'managers', 'playoff_start', 'playoff_teams', 'playoff_byes','fpts_by_roster','fpts_per_game_by_roster']);
        let objStats = await fetchUrl(sleeperURL + league + '/rosters');
        // let objRosters = await fetchUrl(sleeperURL + league + '/rosters');
        // Checks for Divisions
        let divsPresent = true;
        if (!objStats[0]['settings'].hasOwnProperty('division')) {
            divsPresent = false;
            console.log('No divisions established in ' + objLeague['name'] + ' league');
        }
        const teams = info['teams'];
        const playoffStart = info['playoff_start'];
        const playoffTeams = info['playoff_teams'];
        const usernamesByRoster = info['usernames_by_roster'];
        const remaining = playoffStart - week;
        const byes = info.playoff_byes;
        const weeks = Array.from({ length: remaining }, (_, i) => week + i);
        let data = {};
        Object.keys(usernamesByRoster).forEach(user => {
            let roster = objStats.filter(x => x.roster_id == user)[0].settings;
            data[user] = {};
            data[user].username = usernamesByRoster[user];
            divsPresent ? data[user].division = roster.division : data[user].division = null;
            data[user].scenarios = 0;
            data[user].matchup_week = [...weeks];
            data[user].matchup_ids = [];
            data[user].matchup_usernames = [];
            data[user].points = info.fpts_by_roster[user];
            data[user].points_per_game = info.fpts_per_game_by_roster[user];
            data[user].record = [roster.wins, roster.losses, roster.ties];
        });

        // If present, create divisions array to pair with previous arrays
        let divisions = [];
        if (divsPresent) {
            Object.keys(data).forEach(owner => {
                divisions.push(data[owner].division);
            });
        }
        // const usernames = info.usernamesByRoster;
        const settings = {
            week,
            usernamesByRoster,
            divisions,
            divsPresent,
            teams,
            playoffStart,
            playoffTeams,
            remaining,
            byes
        };
        const obj = {
            data,
            settings
        };
        return obj;

    }

    //==============================================================================
    // SLEEPER PLAYOFFS MATCHUP ARRAY GENERATION
    async function sleeperPlayoffsMatchups(league, data, week, playoffStart, teams) {
        let weeks = [], possibilities = [], outcomes = [];;
        let finalWeek = week + 1; // Placeholder value
        for (let a = 0; a < playoffStart - 1; a++) { //for (let a = week; a < playoffStart; a++) {
            if (a < (week - 1)) {
                possibilities.push(null);
                outcomes.push(null);
            } else {
                weeks.push((a + 1));
                let matchups = await fetchUrl(sleeperURL + league + '/matchups/' + (a + 1));
                matchups.forEach(match => {
                    data[match.roster_id].matchup_ids.push(matchups.filter(x => (x.matchup_id == match.matchup_id && x.roster_id != match.roster_id))[0].roster_id);
                    data[match.roster_id].matchup_usernames.push(data[matchups.filter(x => (x.matchup_id == match.matchup_id && x.roster_id != match.roster_id))[0].roster_id].username);
                });
                possibilities[a] = [];
                outcomes[a] = [];
                // Iterate through matchups, first matchup ID is 1, pairing the matchup team IDs with each other and reporting as an array
                for (b = 1; b <= teams / 2; b++) {
                    possibilities[a][b - 1] = matchups.filter(x => (x.matchup_id == b)).map(x => x.roster_id);
                    outcomes[a][b - 1] = null;
                }
                // Updates week until reaching "finalWeek" before end of loop
                finalWeek = a + 1;
            }
        }
        const obj = {
            possibilities,
            outcomes,
            finalWeek,
            weeks
        }
        return obj;
    }

    //==============================================================================
    // SLEEPER PLAYOFFS ROUTE COMBINATION GENERATION
    async function sleeperPlayoffsRoutes(matchups, settings) {

        let arr = null;
        let scenarios = 2 ** (settings.teams / 2); // Weekly outcome possibilities

        for (let period = 0; period < matchups.possibilities.length; period++) {
            let divisor = 1;
            if (matchups.possibilities[period] != null) {
                let index = 0;
                for (let match = 0; match < matchups.possibilities[period].length; match++) {
                    let participants = matchups.possibilities[period][match];
                    for (let a = 0; a < scenarios; a++) {
                        matchups.outcomes[period][a] = matchups.outcomes[period][a] == null ? matchups.outcomes[period][a] = [] : matchups.outcomes[period][a];
                        if (index % 2 == 0) {
                            matchups.outcomes[period][a].push(participants[0]);
                            if (a % (scenarios / (divisor * 2)) == 0) {
                                index++;
                            }
                        } else if (index % 2 > 0) {
                            matchups.outcomes[period][a].push(participants[1]);
                            if (a % ((scenarios) / (divisor * 2)) == 0) {
                                index++;
                            }
                        }
                    }
                    divisor = divisor * 2;
                };
                if (arr == null) {
                    arr = matchups.outcomes[period];
                } else {
                    arr = await extrapolate(arr, matchups.outcomes[period]);
                }
            }
        };
        return arr;
    }

    //==============================================================================
    // SLEEPER PLAYOFFS ROUTE COMBINATION GENERATION
    async function sleeperPlayoffsPaths(data, arr, settings) {
        const byes = settings.byes;
        const byesPresent = byes > 0 ? true : false;
       
        // Create initial value arrays of current owners, wins, and average points per game
        let owners = [];
        let wins = [];
        let points = [];
        let divs = [];
        let divsCount = 0;
        let divsPresent = settings.divsPresent;
        Object.keys(data).forEach(owner => {
            owners.push(parseInt(owner));
            wins.push(data[owner].record[0]);
            points.push(data[owner].points);
            if (divsPresent) {
                divs.indexOf(data[owner].division) == -1 ? divsCount++ : null;
                divs.push(data[owner].division);
            }
        });
        // Sort initial arrays by wins and average points
        let indices = wins.map((_, i) => i);
        indices.sort((a, b) => wins[b] - wins[a] || points[b] - points[a]); // If wins values are equal, sort based on points in descending order
        // Create a new order for owners based on the sorted indices
        owners = indices.map(i => owners[i]);
        wins = indices.map(i => wins[i]);
        points = indices.map(i => points[i]);
        if (divsPresent) {
            divs = indices.map(i => divs[i])
        }
        let playoffScenarios = [], byeScenarios = [], playoffsOusted = [], playoffsOuster = [], byesOusted = [], byesOuster = [];
        const combinations = arr.length;
        for (let a = 0; a < combinations; a++) { // Iterate through array of arr outcomes
            // Create variable for teams that are in the playoffs and also duplicated arrays for manipulating
            let _owners = [...owners];
            let _wins = [...wins];
            let _points = [...points];
            let _divs;

            // Add new possible wins to each team based on position in "_owners" array
            for (let b = 0; b < arr[a].length; b++) {
                _wins[_owners.indexOf(arr[a][b])]++;
            }

            // Sorting based on added wins and average scoring
            let indices = _wins.map((value, index) => index);
            indices.sort((a, b) => {
                if (_wins[a] !== _wins[b]) {
                    return _wins[b] - _wins[a]; // Sort based on wins in descending order
                } else {
                    return _points[b] - _points[a]; // If wins values are equal, sort based on points in descending order
                }
            });
            if (divsPresent) {
                _divs = [...divs];
                let _divsSet = new Set();
                let _selectedIndices = [];
           
                // Iterate through sorted indices and select one team from each division
                for (let i = 0; i < indices.length; i++) {
                    let index = indices[i];
                    let _division = _divs[index];
           
                    // Select the first team from each division (only once)
                    if (!_divsSet.has(_division)) {
                        _divsSet.add(_division);
                        _selectedIndices.push(index);
                    }
                    if (_divsSet.size === new Set(_divs).size) {
                        break;
                    }
                }
                let _remainingIndices = indices.filter(index => !_selectedIndices.includes(index));
                indices.length = 0;
                indices.push(..._selectedIndices, ..._remainingIndices);
                _divs = indices.map(index => _divs[index]);
            }
            
            // Create a new order for _owners, _points, _wins, and _divs (when present) based on the sorted indices
            _owners = indices.map(index => _owners[index]);
            _wins = indices.map(index => _wins[index]);
            _points = indices.map(index => _points[index]);
           
            const firstPass = Math.min(divsCount,settings.playoffTeams);
            let minWins = _wins[0];
            let ousted = false;
            let byeOusted = byesPresent ? false : true; // Only perform first while loop if byes present
            let playoffs = _owners.splice(0, firstPass);
            let winsUsed = _wins.splice(0, firstPass);
            let pointsUsed = _points.splice(0, firstPass);
            let divsUsed = [], divsToCompare = [];
            if (divsPresent) {
                divsUsed.push(..._divs.splice(0, firstPass));
                divsToCompare = [...divsUsed];
            }

            minWins = minWins < Math.min(winsUsed) ? Math.min(winsUsed) : minWins;

            // While loop to evaluate any ousted from bye teams
            while (!byeOusted) {
                let next = 0;
                const o = _owners[next];
                const w = _wins[next];

                if (divsPresent) {
                    const d = _divs[next];
                    const dI = divsUsed.indexOf(d);
                    if (dI >= 0) { // Div is present in divsUsed
                        if (dI < byes) { // Div is among those receiving bye
                            if (winsUsed[dI] === w) { // Wins count is equivalent
                                byesOusted.push(o); // Adds to just missed bye
                                byesOuster.push(playoffs[dI]); // Adds to just missed bye responsible party
                            } else {
                                divsToCompare.splice(dI,1); // Removes division from comparison
                            }
                        }
                    }
                    if (divsToCompare.length > 0 || next > (_owners.length-1)) {
                        byeOusted = true;
                    }
                } else {
                    if (minWins === w) { // Check if next has equivalent wins
                        byesOusted.push(o); // Add to just missed bye team that missed
                        byesOuster.push(playoffs[dI]); // Add to just missed bye responsible party
                    } else {
                        byeOusted = true;
                    }
                }
                if (next < settings.teams) {
                    next++; // move to next entrant, may not matter if byeOusted set to true already
                } else {
                    ousted = true;
                }
            }

            const secondPass = settings.playoffTeams - playoffs.length;
            playoffs.push(..._owners.splice(0, secondPass));
            winsUsed.push(..._wins.splice(0, secondPass));
            pointsUsed.push(..._points.splice(0, secondPass));
            
            if (divsPresent) {
                divsToCompare = [...divsUsed];            
                divsUsed.push(..._divs.splice(0, secondPass));
            }
            minWins = minWins < Math.min(winsUsed) ? Math.min(winsUsed) : minWins;

            // While use to evaluate any ousted from playoffs teams
            while (!ousted) {
                let next = 0;
                const o = _owners[next];
                const w = _wins[next];

                if (divsPresent) {
                    const d = _divs[next];
                    const dI = divsUsed.lastIndexOf(d);
                    if (dI >= 0) { // Div is present in divsUsed
                        if (a < 20) {
                            //console.log(d + ' and o = ' + o + ', w = ' + w + ', compared to ' + winsUsed[dI]);
                        }
                        if (winsUsed[dI] === w) { // Wins count is equivalent
                            playoffsOusted.push(o); // Adds to just missed playoffs
                            playoffsOuster.push(playoffs[dI]); // Adds responsible member
                        } else {
                            divsToCompare.splice(dI,1); // Removes division from comparison
                        }
                    }
                    if (divsToCompare.length > 0 || next > (_owners.length-1)) {
                        ousted = true;
                    }
                } else {
                    if (minWins === w) { // Check if next has equivalent wins
                        playoffsOusted.push(o); // Add to just missed playoffs
                        playoffsOuster.push(playoffs[dI]); // Adds responsible member
                    } else {
                        ousted = true;
                    }
                }
                if (next < settings.teams) {
                    next++; // move to next entrant, may not matter if ousted set to true already
                } else {
                    ousted = true;
                }
            }

            if (byes > 0) {
                byeScenarios.push(playoffs.slice(0,byes));
            }
            playoffScenarios.push(playoffs);
        };
        // Flatten and count instances of all playoff-bound teams
        const qualifiers = playoffScenarios.flat().reduce((acc, value) => {
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
        
        const qualifiersOusted = playoffsOusted.reduce((acc, value) => {
            if (acc != null) {
                acc[value] = (acc[value] || 0) + 1;
                return acc;
            }
        }, {});

        const namesObject = Object.keys(data).reduce((result, key) => ({ ...result, [settings.usernamesByRoster[key]]: {'count':0,'percent':0,'points':0}}), {});   
        let category = "playoff";
        const qualifiersOustedCounts = await generateCounts(playoffsOusted,playoffsOuster);
        Object.keys(data).forEach(user => {
            data[user].scenarios = combinations;
            data[user][category] = {'ousted' :JSON.parse(JSON.stringify(namesObject))};
            data[user][category].ousted_count = qualifiersOusted[user] ? qualifiersOusted[user] : 0;
            data[user][category].ousted_pct = qualifiersOusted[user] ? parseFloat((qualifiersOusted[user]/combinations).toFixed(4)) : 0;
            Object.keys(data).forEach(opponent => {
                if (qualifiersOustedCounts.hasOwnProperty(user)) {
                    if (qualifiersOustedCounts[user].hasOwnProperty(opponent)) {
                        data[user][category].ousted[settings.usernamesByRoster[opponent]].count = qualifiersOustedCounts[user][opponent];
                        data[user][category].ousted[settings.usernamesByRoster[opponent]].percent = parseFloat((qualifiersOustedCounts[user][opponent]/combinations).toFixed(4));
                        data[user][category].ousted[settings.usernamesByRoster[opponent]].points = parseFloat((points[owners.indexOf(parseInt(opponent))] - points[owners.indexOf(parseInt(user))]).toFixed(2));
                    }
                }
            });
        });
        
        const byeQualifiers = byesPresent ? byeScenarios.flat().reduce((acc, value) => {
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {}): {};
        const byeQualifiersOusted = byesPresent ? byesOusted.reduce((acc, value) => {
            if (acc != null) {
                acc[value] = (acc[value] || 0) + 1;
                return acc;
            }
        }, {}): {};
        category = "bye";
        const byeQualifiersOustedCounts = byesPresent ? await generateCounts(byesOusted,byesOuster) : {};
        Object.keys(data).forEach(user => {
            data[user][category] = {'ousted' :JSON.parse(JSON.stringify(namesObject))};
            data[user][category].ousted_count = byeQualifiersOusted[user] ? byeQualifiersOusted[user] : 0;
            data[user][category].ousted_pct = byeQualifiersOusted[user] ? parseFloat((byeQualifiersOusted[user]/combinations).toFixed(4)) : 0;
            Object.keys(data).forEach(opponent => {
                if (byeQualifiersOustedCounts.hasOwnProperty(user)) {
                    if (byeQualifiersOustedCounts[user].hasOwnProperty(opponent)) {
                        data[user][category].ousted[settings.usernamesByRoster[opponent]].count = byeQualifiersOustedCounts[user][opponent];
                        data[user][category].ousted[settings.usernamesByRoster[opponent]].percent = parseFloat((byeQualifiersOustedCounts[user][opponent]/combinations).toFixed(4));
                        data[user][category].ousted[settings.usernamesByRoster[opponent]].points = parseFloat((points[owners.indexOf(parseInt(opponent))] - points[owners.indexOf(parseInt(user))]).toFixed(2));
                    }
                }
            });
        });

        let obj = {
            data,
            qualifiers, // JSON Object of instances of making playoffs by userId
            playoffScenarios
        }
        if (byes > 0) {
            obj.byeQualifiers = byeQualifiers; // JSON Object of instances of earning bye by userId
            obj.byeScenarios = byeScenarios
        }
        return obj;
    }

    //==============================================================================
    // SLEEPER PLAYOFFS SPECIFIC USER CALCULATIONS
    async function sleeperScenarioEvaluations(data, arr, scenarios, qualifiers, settings, type) {
        console.log('Proceeding to evaluate ' + (type == 'bye' ? 'byes' : type == 'playoff' ? 'playoff' : 'ERROR') + ' scenarios');
        const week = settings.week;
        // Generates an array of the correct scale to account for the binomial distribution of the possible outcomes for use as a divisor
        const distribution = await generateScaledDistribution(settings.playoffStart - week, scenarios.length);
       
        const weeks = Array(settings.playoffStart - week).fill(0);
        const winCounts = Array(settings.playoffStart - week + 1).fill(0);
        const namesObject = Object.fromEntries(
            Object.values(data).map(({ username }) => [username, [...weeks]])
        );
        // For all the players that have either not been eliminated nor have been secured, add an array of weeks per username
        Object.keys(data).forEach(user => {
            if (!data[user].hasOwnProperty(type)) {
                data[user][type] = {};
            }
            data[user][type]['matchup'] = JSON.parse(JSON.stringify(namesObject));
            qualifiers.hasOwnProperty(user) ? data[user][type].count = qualifiers[user] : data[user][type].count = 0;
            qualifiers.hasOwnProperty(user) ? data[user][type].chances = parseFloat((qualifiers[user] / scenarios.length).toFixed(4)) : data[user][type].chances = '';
        });
        let ids = {};
        Object.keys(data).forEach(a => {
            const start = Date.now();
           
            // Create some initial empty arrays
            let positiveOutcomes = [];
            let negativeOutcomes = [];
            let minWinsInArr = [...winCounts];
            let minWinsOutArr = [...winCounts];
            let winCountsArr = [...winCounts];
            let winAndInSingleWin = [...weeks];
            let winAndInTally = 0;
            // Iterate through all playoff array values for presence of specified user (a) within that scenario
            if (!qualifiers.hasOwnProperty(a)) {
                console.error('User ' + data[a].username + ': ' + (type == 'bye' ? 'cannot earn a bye' : type == 'playoff' ? 'ELIMINATED from the playoffs' : 'ERROR WITH \'type\' SUBMISSION'));
            } else {
               
                for (let b = 0; b < scenarios.length; b++) {
                    if (scenarios[b].indexOf(parseInt(a)) >= 0) {
                        positiveOutcomes.push(arr[b]);
                        for (let c = 0; c < arr[b].length; c++) {
                            data[a][type].matchup[data[arr[b][c]].username][Math.floor(c/(settings.teams / 2))]++;
                        }
                    } else {
                        negativeOutcomes.push(arr[b]);
                    }
                }
                Object.keys(data).forEach(user => {
                    for (let b = 0; b < (settings.playoffStart - week); b++) {
                        data[a][type].matchup[data[user].username][b] = parseFloat((((data[a][type].matchup[data[user].username][b] / positiveOutcomes.length)-0.5)*2).toFixed(4));
                    }
                });
               
                // let winAndInMatrix = Array.from({ length: (settings.playoffStart - week) }, (v, i) => Array.from({ length: (settings.playoffStart - week) }, (v, i) => 0));
               
                for (let b = 0; b < positiveOutcomes.length; b++) {
                    let winsArr = [...weeks];
                    let wins = 0;
                    for (let c = 0; c < (settings.playoffStart - week); c++) {
                        if ((positiveOutcomes[b].slice(c * settings.teams / 2, (c + 1) * settings.teams / 2)).indexOf(parseInt(a)) >= 0) {
                            winsArr[c] = 1;
                            wins++;
                        }
                    }
                    if (wins > 0) {
                        for (let c = 0; c < winsArr.length; c++) {
                            if (winsArr[c] == 1) {
                                // winAndInMatrix.map((_, index) => winAndInMatrix[c][index] += winsArr[index]);
                                if (wins == 1) {
                                    winAndInSingleWin[c]++;
                                    winAndInTally++;
                                }
                            }
                        }
                    }
                    minWinsInArr[wins]++;
                }
            }
            // Calculate when winning and still missing the playoffs
            let winAndOut = [...weeks];
            for (let b = 0; b < negativeOutcomes.length; b++) {
                let winsArr = [...weeks];
                let wins = 0;
                for (let c = 0; c < (settings.playoffStart - week); c++) {
                    if ((negativeOutcomes[b].slice(c * settings.teams / 2, (c + 1) * settings.teams / 2)).indexOf(parseInt(a)) >= 0) {
                        winsArr[c] = 1;
                        wins++;
                    }
                }
                if (wins == 1) {
                    winAndOut[winsArr.indexOf(1)]++;
                }
                minWinsOutArr[wins]++;
            }

            // Setting some key values, mostly empty arrays, to the user table values
            data[a][type].paths = positiveOutcomes.length;
            data[a][type].pct_out_by_wins = [...winCounts];
            data[a][type].pct_by_wins = [...winCounts];
            if (positiveOutcomes.length === scenarios.length) {
                data[a][type].win_and_in = Array(weeks.length).fill('');
            } else if (winAndInTally > 0) {
                data[a][type].win_and_in = [...weeks].map((_, index) => parseFloat((winAndInSingleWin[index] / (winAndInSingleWin[index] + winAndOut[index])).toFixed(5)));
            } else {
                data[a][type].win_and_in = [...weeks];
            }
            // Reprocess all these tables to be scaled based on quantity of positive outcomes/playoff scenarios
            for (let c = 0; c < minWinsInArr.length; c++) {
                data[a][type].pct_out_by_wins[c] = (positiveOutcomes.length > 0 && negativeOutcomes.length > 0) ? parseFloat((minWinsOutArr[c] / distribution[c]).toFixed(4)) : '';
                minWinsInArr[c] > 0 ? data[a][type].pct_by_wins[c] = parseFloat((minWinsInArr[c] / (minWinsInArr[c] + minWinsOutArr[c])).toFixed(4)) : null;
            }
            const end = Date.now();
            const total = (end - start) / 1000;
            
            let text = 'User ' + data[a].username + ': ' + (type == 'playoff' || 'bye' ? type :'ERROR') + ' details calculated.';
            if (data[a][type].chances != 0 && a < Object.keys(data).length - 1) {
                const remaining = total * (Object.keys(data).length - a - 1);
                if (remaining > 5000) {
                    text = text.replace('.',', approximately ' + parseFloat(remaining.toFixed(2)) + ' seconds remaining of ' + (type == 'playoff' || 'bye' ? type :'ERROR') + ' calculations.')
                }
                console.log(text);
            }
        });
        return data;
    }    

    // Function to calculate the binomial coefficient C(n, k)
    function binomialCoefficient(n, k) {
        if (k === 0 || k === n) return 1;
        let numerator = 1;
        let denominator = 1;
        for (let i = 0; i < k; i++) {
        numerator *= (n - i);
        denominator *= (i + 1);
        }
        return numerator / denominator;
    }
 
    // Function to generate the scaled binomial distribution array for length X
    function generateScaledDistribution(X, targetSum) {
        const binomialCoefficients = [];
        let totalCombinations = 0;
       
        // Calculate binomial coefficients for all k from 0 to X
        for (let k = 0; k <= X; k++) {
            const coeff = binomialCoefficient(X, k);
            binomialCoefficients.push(coeff);
            totalCombinations += coeff; // Sum of binomial coefficients
        }
   
        // Calculate the scaling factor
        const scalingFactor = targetSum / totalCombinations;
   
        // Scale the distribution
        const scaledDistribution = binomialCoefficients.map(coeff => Math.round(coeff * scalingFactor));
       
        return scaledDistribution;
    }

    // Provide two objects of arrays, with scenario numbers for each
    // Combines both sets into total outcomes
    // Outputs a single object of labeled scenarios that is equivalent to the product of the total count for each array (64 x 64 = 4096, for example)
    async function extrapolate(weekOne,weekTwo) {
       
        let output = [];
        let scenario = 0;
        for (let x = 0; x < weekOne.length; x++) {
          for (let y = 0; y < weekTwo.length; y++) {
            output[scenario] = weekOne[x].concat(weekTwo[y]);
            scenario++;
          };
        };
        return output;
    }

    // Function to output object that displays the number of times a member ousted another
    async function generateCounts(ousted, ouster) {
        const counts = {};
        for (let a = 0; a < ousted.length; a++) {
            const _ousted = ousted[a];
            const _ouster = ouster[a];
            if (!counts[_ousted]) {
                counts[_ousted] = {};
            }
            counts[_ousted][_ouster] = (counts[_ousted][_ouster] || 0) + 1;
        }
        return counts;
    }

    //==============================================================================
    // CONVERT SPECIFIC JSON TO A CSV TABLE
    function sleeperPlayoffsJsonToCsv(data) {
        let headers = ['id'];
        let rows = [];
        let weeks = [...data[Object.keys(data)[0]].matchup_week];
        let string = "matchup";
        const regexMatches = new RegExp(/matchup/);
        const regexRecord = new RegExp(/record/);
        const regexOusted = new RegExp(/ousted/);
        const recordArr = ['record_w','record_l','record_t'];
        Object.keys(data).forEach(user => {
            delete data[user].matchup_week;
            let row = [user];
            Object.keys(data[user]).forEach(key => {
                const keyType = evaluateType(data[user][key]);
                const matchup = regexMatches.test(key);
                const record = regexRecord.test(key);
                const ousted = regexOusted.test(key);
                if (keyType === 'string' || keyType === 'number') {
                    if (headers.indexOf(key) < 0) {
                        headers.push(key)
                    }
                    row.push(data[user][key]);
                } else if (keyType === 'array') {
                    if (matchup && !record && headers.indexOf(key.replace(string + '_','')+'_'+weeks[0]) < 0) {
                        headers.push(...Array.from({length : data[user][key].length}, (_, i)=>(key.replace(string + '_','')+'_'+weeks[i])));
                    } else if (!matchup && record && headers.indexOf(recordArr[0]) < 0) {
                        headers.push(...recordArr);
                    } else if (!matchup && !record && headers.indexOf(key) < 0) {
                        headers.push(...Array(data[user][key].length).fill(key));
                    }
                    row.push(...data[user][key]);
                } else if (keyType === 'array') {
                    row.push(...data[user][key]);
                } else if (keyType === 'object') {
                    Object.keys(data[user][key]).forEach(subKey => {
                        const subKeyType = evaluateType(data[user][key][subKey]);
                        if (subKeyType === 'string' || subKeyType === 'number') {
                            if (headers.indexOf(key + '_' + subKey) < 0) {
                                headers.push(key + '_' + subKey)
                            }
                            row.push(data[user][key][subKey]);
                        } else if (subKeyType === 'array' && regexMatches.test(key)) {
                            if (headers.indexOf(key + '_' + subKey) < 0) {
                                headers.push(...Array.from({length : data[user][key][subKey].length}, (_, i)=>(key + '_' + weeks[i] + '_' + subKey)));
                                row.push(...data[user][key][subKey]);
                            } else {
                                row.push(...data[user][key][subKey]);
                            }
                        } else if (subKeyType === 'array') {
                            if (headers.indexOf(key + '_' + subKey) < 0) {
                                headers.push(...Array(data[user][key][subKey].length).fill(key + '_' + subKey));
                            }
                            row.push(...data[user][key][subKey]);
                        } else if (keyType === 'object') {
                            Object.keys(data[user][key][subKey]).forEach(subSubKey => {
                                let matchupSubKey = false;
                                let oustedSubKey = false;
                                const subSubKeyType = evaluateType(data[user][key][subKey][subSubKey]);
                                matchupSubKey = regexMatches.test(subKey);
                                oustedSubKey = regexOusted.test(subKey);
                                if (subSubKeyType === 'string' || subSubKeyType === 'number') {
                                    if (headers.indexOf(key + '_' + subKey + '_' + subSubKey) < 0) {
                                        headers.push(key + '_' + subKey);
                                    }
                                    row.push(data[user][key][subKey][subSubKey]);
                                } else if (subSubKeyType === 'array') {
                                    if (matchupSubKey && headers.indexOf(key + '_' + weeks[0] + '_' + subSubKey) < 0) {
                                        headers.push(...Array.from({length : data[user][key][subKey][subSubKey].length}, (_, i)=>(key + '_' + weeks[i] + '_' + subSubKey)));
                                    } else if (!matchupSubKey && headers.indexOf(key + '_' + subKey + '_' + subSubKey) < 0) {
                                        headers.push(...Array(data[user][key][subKey][subSubKey].length).fill(key + '_' + subKey + '_' + subSubKey));
                                    }
                                    row.push(...data[user][key][subKey][subSubKey]);
                                } else if (subSubKeyType === 'object' && oustedSubKey) {
                                    Object.keys(data[user][key][subKey][subSubKey]).forEach(subSubSubKey => {
                                        if (headers.indexOf(key + '_' + subKey + '_' + subSubKey + '_' + subSubSubKey) < 0) {
                                            headers.push(key + '_' + subKey + '_' + subSubKey + '_' + subSubSubKey);
                                        }
                                        row.push(data[user][key][subKey][subSubKey][subSubSubKey]);
                                    });
                                }
                            });
                        }
                    });
                }
            });
            rows.push(row);
        });
       
        const csvArray = [headers, ...rows];
        return (csvArray.map(row => row.join(",")).join("\n"));


    }


    function evaluateType(variable) {
        let keyType = 'number';
        if (Array.isArray(variable)) {
            keyType = 'array';
        } else if (variable && typeof variable === 'object') {
            keyType = 'object';
        } else if (typeof variable === 'string') {
            keyType = 'string';
        }
        return keyType;
    }

    //------------------------------------------------------------------------
    // LEAGUE INFO - Pulls league information to give an array of the non-indexed roster based on the most recent draft for a league
    // Provide league ID (or object) and also give single value or array of the following to return an array of the information desired: 'name','teams','divisions','starters','starters_indexed','roster','roster_indexed','scoring','managers','usernames','usernames_by_roster','roster_ids','fpts','fpts_by_roster','fpts_against','fpts_against_by_roster','record','record_by_roster','record_array','record_array_by_roster','streak','streak_by_roster','usernames_by_manager','season','scoring_type','starter_size','bench_size','draft','picks_object','picks','picks_by_roster','picks_by_user','picks_array','playoff_teams','playoff_start', 'playoff_byes';
    async function leagueInfo(league,info) {
        const leagueURL = 'https://api.sleeper.app/v1/league/' + league;
        const rostersURL = leagueURL + '/rosters';
        const draftsURL = leagueURL + '/drafts';
        let picksURL = 'https://api.sleeper.app/v1/draft/' + 'REPLACE' + '/picks';
        const perGame = new RegExp(/_per_game/,'g');

        if(typeof league != 'string') {
            return ('Enter league id as a string, then declare fetch request as array as second variable');
        } else {
        if (typeof info != 'array' && typeof info != 'object') {
            info = [info];
        }
        let results = {}; // Object to return
        let leagueObj = {}, rostersObj = {}, picksObj = {}, draftObj = {}, usernamesObj = {};
        try {
            leagueObj = await fetchUrl(leagueURL);
        } catch (err) {
            return ('Invalid input, no league data fetched, enter league ID as a string');
        }
        const ids = Array.from({length : leagueObj.total_rosters}, (_,v) => v + 1);
        const completed = parseInt(leagueObj.settings.last_scored_leg);
        const needRosters = ['usernames_by_roster','fpts','fpts_by_roster','fpts_against','fpts_against_by_roster','fpts_per_game','fpts_per_game_by_roster','fpts_against_per_game','fpts_against_per_game_by_roster','record','record_by_roster','record_array','record_array_by_roster','streak','streak_by_roster'];
        const needPicks = ['picks_object','picks','picks_by_roster','picks_by_user','picks_array','scoring_type'];
        const needUsernames = ['usernames','usernames_by_roster','usernames_by_manager'];
        const needDraft = ['draft','managers','scoring_type'].concat(needUsernames,needPicks);
        
        for (let a = 0; a < info.length; a++){
            // Fetch rosters API info if needed
            if (needRosters.indexOf(info[a]) >= 0 && Object.keys(rostersObj).length === 0) {
                rostersObj = await fetchUrl(rostersURL);
            }
            
            // Draft API info needed
            if (needDraft.indexOf(info[a]) >= 0 && Object.keys(draftObj).length === 0) {
                draftObj = {'start_time':0};
                draftsObj = {};
                try {
                    draftsObj = await fetchUrl(draftsURL);
                } catch (err) {
                    return ('No drafts for league indicated, change request to avoid draft information (\"picks\",\"picks_by_roster\",\"picks_by_user\",\"picks_array\",\"scoring_type\")');
                }
                if (draftsObj.length > 1) {
                    for (let b = 0; b < fullDraftsObj.length; b++) {
                    draftsObj[b]['start_time'] > draftObj['start_time'] ? draftObj = draftsObj[b] : null;
                    }
                } else {
                    draftObj = draftsObj[0];
                }
            }
    
            if (needUsernames.indexOf(info[a]) >= 0 && Object.keys(usernamesObj).length === 0) {
                for (let id in draftObj.draft_order) {
                    try {
                        const obj = await fetchUrl('https://api.sleeper.app/v1/user/' + id)
                        const user = obj.username;
                        usernamesObj[id] = user;
                    } catch (err) {
                    return ('No information for user ID indicated, ' + id);
                    }
                }
            }
    
            // Fetch picks API info if needed
            if (needPicks.indexOf(info[a]) >= 0 && Object.keys(picksObj).length === 0) {
            picksObj = await fetchUrl(picksURL.replace('REPLACE',draftObj['draft_id']));
            }
    
            // Large conditional check for which value to return (could be changed to "switch" programming)
            if (info[a] == 'starters' || info[a] == 'starters_indexed') {
                let starters = leagueObj['roster_positions'].filter(x => x != 'BN');
                if (info[a] == 'starters_indexed') {
                    let index = 1;
                    let indexed = [];
                    for (let c = 0; c < starters.length; c++) {
                    indexed[c] = starters[c] != 'BN' ? starters[c]+index : starters[c];
                    starters[c] == starters[c+1] ? index++ : index = 1;            
                    }
                    results[info[a]] = indexed;
                } else {
                    results[info[a]] = starters;
                }
            } else if (info[a] == 'roster' || info[a] == 'roster_indexed') {
                let reserve = 0;
                try {
                    reserve = leagueObj['settings']['reserve_slots'];
                } catch (err) {
                    // No reserve slots indicated
                }
                let roster = (leagueObj['roster_positions']).concat(Array(reserve).fill('IR'));
                if (info[a] == 'roster_indexed') {
                    let index = 1;
                    let indexed = [];
                    for (let c = 0; c < roster.length; c++) {
                    indexed[c] = roster[c]+index;
                    //indexed[c] = roster[c] != 'BN' ? roster[c]+index : roster[c]; // Alternative if preferred no bench numbering
                    roster[c] == roster[c+1] ? index++ : index = 1;
                    }
                    results[info[a]] = indexed;
                } else {
                    results[info[a]] = roster;
                }
            } else if (info[a] == 'divisions') {
            let divisions = {};
            try {
                let meta = leagueObj.metadata;
                for (let key in meta) {
                key.match(/division\_[0-9]{1,3}/) ? divisions[parseInt(key.replace(/division\_/g, ''))] = meta[key] : null
                }
            } catch (err) {
                // No divisions found
            }
                results[info[a]] = divisions;
            } else if (info[a] == 'playoff_teams') {
                results[info[a]] = leagueObj['settings']['playoff_teams'];
            } else if (info[a] == 'playoff_start') {
                results[info[a]] = leagueObj['settings']['playoff_week_start'];
            } else if (info[a] == 'playoff_byes') {
                results[info[a]] = await leagueByes(league);
            } else if (info[a] == 'scoring') {
                results[info[a]] = leagueObj['scoring_settings'];
            } else if (info[a] == 'starter_size') {
                results[info[a]] = leagueObj['roster_positions'].filter(x => x != 'BN').length;
            } else if (info[a] == 'bench_size') {
                results[info[a]] = leagueObj['roster_positions'].filter(x => x == 'BN').length;
            } else if (info[a] == 'managers') {
                let managers = [];
            for (let key in draftObj['draft_order']) {
                managers.push(key);
            }
            results['managers'] = managers;
            } else if (info[a] == 'usernames') {
            let users = [];
            for (let key in draftObj['draft_order']) {
                try {
                    const obj = await fetchUrl('https://api.sleeper.app/v1/user/' + key)
                    const user = obj ['username'];
                    users[key] = user;
                } catch (err) {
                return ('No information for user ID indicated, ' + key);
                }
            }
                results['usernames'] = users;                
            } else if (info[a] == 'usernames_by_manager') {
                results[info[a]] = usernamesObj;
            } else if (info[a] == 'roster_ids') {
                results[info[a]] = ids;
            } else if (info[a] == 'usernames_by_roster') {
            let usernames = {};
                Object.keys(usernamesObj).forEach(key => {
                    usernames[rostersObj.filter(x => x.owner_id == key)[0].roster_id] = usernamesObj[key];
                });
                results[info[a]] = usernames;
            } else if (info[a] == 'teams') {
                results[info[a]] = leagueObj['total_rosters'];
            } else if (info[a] == 'name') {
                results[info[a]] = leagueObj['name'];
            } else if (info[a] == 'season') {
                results[info[a]] = leagueObj['season'];
            } else if (info[a] == 'fpts' || info[a] == 'fpts_against' || info[a] == 'fpts_per_game' || info[a] == 'fpts_against_per_game') {
                const divisor = perGame.test(info[a]) ? completed : 1;
                let arr = [];
                for (let c = 0; c < rostersObj.length; c++) {
                  arr.push(parseFloat(((rostersObj[c].settings[info[a].replace('_per_game','')] + '.' + rostersObj[c].settings[info[a].replace('_per_game','') + '_decimal'])/divisor).toFixed(2)));
                }
                results[info[a]] = arr;
            } else if (info[a] == 'fpts_by_roster' || info[a] == 'fpts_against_by_roster' || info[a] == 'fpts_per_game_by_roster' || info[a] == 'fpts_against_per_game_by_roster') {
                const divisor = perGame.test(info[a]) ? completed : 1;
                let obj = {};
                for (let c = 0; c < rostersObj.length; c++) {
                  obj[ids[c]] = parseFloat(((rostersObj[c].settings[info[a].replace('_per_game','').replace('_by_roster','')] + '.' + rostersObj[c].settings[info[a].replace('_per_game','').replace('_by_roster','') + '_decimal'])/divisor).toFixed(2));
                }
                results[info[a]] = obj;
            } else if (info[a] == 'record') {
                let arr = [];
                for (let c = 0; c < rostersObj.length; c++) {
                    arr.push(rostersObj[c].metadata.record);
                }
                results[info[a]] = arr;
            } else if (info[a] == 'record_by_roster') {
                let obj = {};
                for (let c = 0; c < rostersObj.length; c++) {
                    obj[ids[c]] = rostersObj[c].metadata.record;
            }
                results[info[a]] = obj;
            } else if (info[a] == 'record_array') {
                let arr = [];
                for (let c = 0; c < rostersObj.length; c++) {
                    arr.push([rostersObj[c].settings.wins,rostersObj[c].settings.losses,rostersObj[c].settings.ties]);
                }
                results[info[a]] = arr;
            } else if (info[a] == 'record_array_by_roster') {
                let obj = {};
                for (let c = 0; c < rostersObj.length; c++) {
                    obj[ids[c]] = [rostersObj[c].settings.wins,rostersObj[c].settings.losses,rostersObj[c].settings.ties];
                }
                results[info[a]] = obj;
            } else if (info[a] == 'streak') {
                let arr = [];
                for (let c = 0; c < rostersObj.length; c++) {
                    arr.push(rostersObj[c].metadata.streak);
                }
                results[info[a]] = arr;
            } else if (info[a] == 'streak_by_roster') {
                let obj = {};
                for (let c = 0; c < rostersObj.length; c++) {
                    obj[ids[c]] = rostersObj[c].metadata.streak;
                }
                results[info[a]] = obj;
            } else if (info[a] == 'draft') {
                results[info[a]] = draftObj;
            } else if (info[a] == 'draft_id') {
                results[info[a]] = draftObj.draft_id;
            } else if (info[a] == 'scoring_type') {
                results[info[a]] = draftObj.metadata.scoring_type;
            } else if (info[a] == 'picks_object' || info[a] == 'picks' || info[a] == 'picks_by_roster' || info[a] == 'picks_by_user' || info[a] == 'picks_array' || info[a] == 'scoring_type') {
                if (info[a] == 'picks_object') {
                    results[info[a]] = picksObj;
                } else if (info[a] == 'picks') {
                    let arr = [];
                    for (let c = 0; c < picksObj.length; c++) {
                    arr.push(picksObj[c].metadata.player_id);
                    }
                    results[info[a]] = arr;
                } else if (info[a] == 'picks_by_roster') {
                    let rosters = {};
                    for (let c = 0; c < picksObj.length; c++) {
                    rosters[picksObj[c].roster_id] == undefined ? rosters[picksObj[c].roster_id] = [] : null
                    rosters[picksObj[c].roster_id].push(picksObj[c].metadata.player_id);
                    }
                    results[info[a]] = rosters;             
                } else if (info[a] == 'picks_by_user') {
                    let rosters = {};
                    for (let c = 0; c < picksObj.length; c++) {
                    rosters[picksObj[c].picked_by] == undefined ? rosters[picksObj[c].picked_by] = [] : null
                    rosters[picksObj[c].picked_by].push(picksObj[c].metadata.player_id);
                    }
                    results[info[a]] = rosters;
                } else if (info[a] == 'picks_array') {
                    let round = [];
                    let all = [];
                    for (let c = 0; c < picksObj.length; c++) {
                    round.push(picksObj[c].metadata.player_id);
                    if (picksObj[c].round > 1) {
                        if (picksObj[c].round > picksObj[c-1].round) {
                        all.push(round);
                        round = [];
                        }
                    }
                    }
                    results[info[a]] = all;          
                }
            } else {
                results[info[a]] == 'INVALID REQUEST';
            }
        }
        if (Object.keys(results).length == 0) {
            return ('No values found based on user input, use one or more of the following: \"teams\",\"name\",\"roster\",\"roster_indexed\",\"starters\",\"starters_indexed\",\"managers\",\"season\",\"scoring_type\",\"starter_size\",\"bench_size\",\"picks\",\"picks_by_roster\",\"picks_by_roster\",\"picks_array\"')
        } else if (Object.keys(results).length == 1) {
            return results[Object.keys(results)[0]];
        } else {
            return results;
        }
        }
    }
  
    //------------------------------------------------------------------------
    // LEAGUE BYES - Pulls league bye count
    async function leagueByes(league) {
        if (typeof league != 'string') {
            return ('Enter league id as a string, then declare fetch request as array as second variable');
        } else {
            let json = {};
            try {
                json = await fetchUrl(sleeperURL + league + '/winners_bracket');
            } catch (err) {
                return ('Invalid input, no league data fetched, enter league ID as a string');
            }
            let count = 0;
            for (let match in json) {
                if (Number.isInteger(json[match].t1) && Number.isInteger(json[match].t2)) {
                } else if (Number.isInteger(json[match].t1) && json[match].t2 == null) {
                    if (typeof json[match].t2_from == 'object') {
                        count++;
                    }
                } else if (Number.isInteger(json[match].t2) && json[match].t1 == null) {
                    if (typeof json[match].t1_from == 'object') {
                        count++;
                    }
                }
            }
            return count;
        }
    }

    //------------------------------------------------------------------------
    // SEASON INFO - Function to quickly fetch year or week (or both) from the Sleeper API
    async function seasonInfo(query) {
        let obj = await fetchUrl('https://api.sleeper.app/v1/state/nfl');
        let year = obj['season'];
        let week = obj['week'];
        let display_week = obj['display_week'];
        // console.log(JSON.stringify(obj));
        if (query == 'year') {
            // console.log(year);
            return parseInt(year);
        } else if (query == 'week') {
            // console.log(week);
            return parseInt(week);
        } else if (query == 'display_week') {
            // console.log(display_week);
            return parseInt(display_week);
        } else {
            // console.log([parseInt(year),parseInt(week)])
            return [year, week];
        }
    }

    //------------------------------------------------------------------------
    // GET KEY BY VALUE - Inverse lookup based on input of object and value for key
    async function getKeyByValue(object, value) {
        return Object.keys(object).find(key => object[key] === value);
    }
})();


//------------------------------------------------------------------------
// FETCH URL - Function for Fetching JSON
const fetchUrl = async (url, options) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const jsonData = await response.json(); // Parse the response as JSON
        // console.log('API Response:', jsonData);  // Log the full response
        return jsonData;
    } catch (error) {
        console.error(`Error fetching URL: ${error.message}`);
        throw error;
    }
};
