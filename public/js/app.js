const API_URL = '/api';

const state = {
    currentTournamentId: null,
};

// --- UI Management ---
const ui = {
    switchTab: (tabId) => {
        document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
        
        document.getElementById(`tab-${tabId}`).classList.add('active');
        const navEl = document.querySelector(`[data-tab="${tabId}"]`);
        if (navEl) navEl.classList.add('active');

        if (tabId === 'dashboard') api.fetchTournaments();
        if (tabId === 'player-career') api.fetchAllPlayers();
    },

    toggleCreateModal: (show) => {
        document.getElementById('create-modal').classList.toggle('active', show);
    },

    toggleScoreModal: (show, matchId = null, p1Name = '', p2Name = '', p1Id = null, p2Id = null, isReadOnly = false, games = []) => {
        const modal = document.getElementById('score-modal');
        modal.classList.toggle('active', show);
        
        if (show && matchId) {
            document.getElementById('score-match-id').value = matchId;
            document.getElementById('score-p1-id').value = p1Id;
            document.getElementById('score-p2-id').value = p2Id;
            document.getElementById('score-p1-name').innerText = p1Name || 'TBD';
            document.getElementById('score-p2-name').innerText = p2Name || 'TBD';
            
            // Handle read-only state
            document.getElementById('btn-save-score').style.display = isReadOnly ? 'none' : 'block';
            const inputs = ['score-p1', 'score-p2', 'stat-p1-apm', 'stat-p1-pps', 'stat-p1-vs', 'stat-p2-apm', 'stat-p2-pps', 'stat-p2-vs'];
            inputs.forEach(id => {
                document.getElementById(id).disabled = isReadOnly;
                document.getElementById(id).value = (id.startsWith('score')) ? 0 : '';
            });

            // Populate if readOnly and data exists
            if (isReadOnly) {
                // If the user already provided the score in the DOM we don't have it directly here, but we can pass it
            }
        }
    },

    renderTournaments: (tournaments) => {
        const container = document.getElementById('tournaments-list');
        container.innerHTML = tournaments.map(t => `
            <div class="tournament-card glass-panel" onclick="api.openTournament(${t.id})">
                <h3>${t.name}</h3>
                <span class="badge ${t.status}">${t.status}</span>
                <div class="meta">
                    <span>${t.game}</span>
                    <span>${t.type.replace('_', ' ')}</span>
                </div>
            </div>
        `).join('');
    },

    renderMatchList: (matches) => {
        const container = document.getElementById('matches-list');
        if (matches.length === 0) {
            container.innerHTML = '';
            return;
        }
        const tournamentType = matches[0].tournament.type;
        
        container.innerHTML = matches.map(m => {
            const p1 = m.player1?.name || 'TBD';
            const p2 = m.player2?.name || 'TBD';
            const isCompleted = m.status === 'COMPLETED';
            const p1Winner = isCompleted && m.score1 > m.score2;
            const p2Winner = isCompleted && m.score2 > m.score1;
            
            const roundText = tournamentType === 'DOUBLE' 
                ? `Round ${m.round} ${m.isWinnersBracket ? '(Winners)' : '(Losers)'}`
                : `Round ${m.round}`;

            let actionHtml = '';
            if (!isCompleted && m.player1Id && m.player2Id) {
                actionHtml = `<button class="btn secondary" onclick="ui.toggleScoreModal(true, ${m.id}, '${p1}', '${p2}', ${m.player1Id}, ${m.player2Id})">Update Score</button>`;
            } else if (isCompleted) {
                const gameData = m.games && m.games.length > 0 ? encodeURIComponent(JSON.stringify(m.games)) : '[]';
                actionHtml = `<button class="btn text" onclick="api.viewMatchStats(${m.id}, '${p1}', '${p2}', ${m.player1Id}, ${m.player2Id}, ${m.score1}, ${m.score2}, '${gameData}')">View Stats</button>`;
            } else {
                actionHtml = `<span class="badge ${m.status}">${m.status}</span>`;
            }

            return `
                <div class="match-card">
                    <div class="match-players">
                        <div class="round-info">${roundText}</div>
                        <div class="player-row ${p1Winner ? 'winner' : ''}">
                            <span>${p1}</span>
                            <span>${isCompleted ? m.score1 : '-'}</span>
                        </div>
                        <div class="player-row ${p2Winner ? 'winner' : ''}">
                            <span>${p2}</span>
                            <span>${isCompleted ? m.score2 : '-'}</span>
                        </div>
                    </div>
                    <div class="match-actions">
                        ${actionHtml}
                    </div>
                </div>
            `;
        }).join('');
    },

    renderPlayersTable: (players) => {
        const container = document.getElementById('players-list');
        container.innerHTML = players.map(p => `
            <tr>
                <td>${p.id}</td>
                <td><strong>${p.name}</strong></td>
                <td>${p.matchWins}</td>
                <td>${p.matchLosses}</td>
                <td>${p.avgApm}</td>
                <td>${p.avgPps}</td>
                <td>${p.avgVs}</td>
            </tr>
        `).join('');
    },

    sortPlayers: (key) => {
        if (!state.allPlayers) return;
        state.sortState = state.sortState || {};
        state.sortState[key] = !state.sortState[key]; // toggle asc/desc
        
        state.allPlayers.sort((a, b) => {
            const valA = a[key];
            const valB = b[key];
            if (valA < valB) return state.sortState[key] ? -1 : 1;
            if (valA > valB) return state.sortState[key] ? 1 : -1;
            return 0;
        });
        ui.renderPlayersTable(state.allPlayers);
    },
    renderRankings: (rankings) => {
        const container = document.getElementById('rankings-list');
        if (rankings.length === 0) {
            container.innerHTML = '<p class="text-muted">Rankings not available yet.</p>';
            return;
        }
        container.innerHTML = rankings.map(r => `
            <div class="rank-item">
                <div class="rank-num">#${r.rank}</div>
                <div class="rank-name">${r.player}</div>
            </div>
        `).join('');
    }
};

// --- API Calls ---
const api = {
    fetchTournaments: async () => {
        try {
            const res = await fetch(`${API_URL}/tournaments`);
            const data = await res.json();
            ui.renderTournaments(data);
        } catch (e) {
            console.error('Failed to fetch tournaments', e);
        }
    },

    createTournament: async () => {
        const name = document.getElementById('form-name').value;
        const game = document.getElementById('form-game').value;
        const type = document.getElementById('form-type').value;
        const rawParticipants = document.getElementById('form-participants').value.split('\n').filter(p => p.trim());
        
        const participants = rawParticipants.map((p, idx) => ({ name: p.trim(), seed: idx + 1 }));

        try {
            const res = await fetch(`${API_URL}/tournaments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, game, type, participants })
            });
            if (res.ok) {
                ui.toggleCreateModal(false);
                api.fetchTournaments();
            } else {
                const err = await res.json();
                alert('Error: ' + err.error);
            }
        } catch (e) {
            console.error(e);
        }
    },

    openTournament: async (id) => {
        state.currentTournamentId = id;
        document.getElementById('nav-detail').style.display = 'block';
        ui.switchTab('tournament-detail');
        await api.refreshTournamentData();
    },

    refreshTournamentData: async () => {
        const id = state.currentTournamentId;
        
        // Parallel fetch bracket and rankings
        const [bracketRes, rankRes] = await Promise.all([
            fetch(`${API_URL}/tournaments/${id}/bracket`),
            fetch(`${API_URL}/tournaments/${id}/rankings`)
        ]);

        const matches = await bracketRes.json();
        const rankings = await rankRes.json();

        // Check if generated
        const isDraft = matches.length === 0;
        document.getElementById('btn-generate-bracket').style.display = isDraft ? 'block' : 'none';
        
        if (!isDraft) {
            const tInfo = matches[0].tournament;
            document.getElementById('detail-title').innerText = tInfo.name;
            document.getElementById('detail-status').innerText = tInfo.status;
            document.getElementById('detail-status').className = `badge ${tInfo.status}`;
        }

        ui.renderMatchList(matches);
        ui.renderRankings(rankings);
    },

    generateBracket: async () => {
        const id = state.currentTournamentId;
        try {
            await fetch(`${API_URL}/tournaments/${id}/generate-bracket`, { method: 'POST' });
            api.refreshTournamentData();
        } catch (e) {
            console.error(e);
        }
    },

    updateScore: async () => {
        const matchId = document.getElementById('score-match-id').value;
        const p1Id = document.getElementById('score-p1-id').value;
        const p2Id = document.getElementById('score-p2-id').value;
        const score1 = parseInt(document.getElementById('score-p1').value);
        const score2 = parseInt(document.getElementById('score-p2').value);

        const p1Apm = document.getElementById('stat-p1-apm').value;
        const p1Pps = document.getElementById('stat-p1-pps').value;
        const p1Vs = document.getElementById('stat-p1-vs').value;
        
        const p2Apm = document.getElementById('stat-p2-apm').value;
        const p2Pps = document.getElementById('stat-p2-pps').value;
        const p2Vs = document.getElementById('stat-p2-vs').value;

        try {
            // Update score
            await fetch(`${API_URL}/matches/${matchId}/score`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ score1, score2, status: 'COMPLETED' })
            });

            // If stats provided, add game
            if (p1Apm && p1Pps) {
                const gamePayload = {
                    games: [{
                        stats: [
                            { playerId: parseInt(p1Id), apm: parseFloat(p1Apm), pps: parseFloat(p1Pps), vs: parseFloat(p1Vs || 0), isWinner: score1 > score2 },
                            { playerId: parseInt(p2Id), apm: parseFloat(p2Apm), pps: parseFloat(p2Pps), vs: parseFloat(p2Vs || 0), isWinner: score2 > score1 }
                        ]
                    }]
                };
                await fetch(`${API_URL}/matches/${matchId}/games`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(gamePayload)
                });
            }

            ui.toggleScoreModal(false);
            api.refreshTournamentData();
        } catch (e) {
            alert('Error updating score');
        }
    },

    searchPlayer: async () => {
        const playerId = document.getElementById('search-player-id').value;
        if (!playerId) return;

        try {
            const res = await fetch(`${API_URL}/players/${playerId}/career`);
            if (!res.ok) throw new Error('Player not found');
            const data = await res.json();
            
            document.getElementById('player-career-result').style.display = 'block';
            document.getElementById('career-name').innerText = data.player.name;
            document.getElementById('c-match-wins').innerText = data.careerStats.matches.wins;
            document.getElementById('c-match-losses').innerText = data.careerStats.matches.losses;
            document.getElementById('c-game-wins').innerText = data.careerStats.games.wins;
            document.getElementById('c-apm').innerText = data.careerStats.avgApm;
            document.getElementById('c-pps').innerText = data.careerStats.avgPps;
            document.getElementById('c-vs').innerText = data.careerStats.avgVs;

        } catch (e) {
            alert(e.message);
        }
    },

    fetchAllPlayers: async () => {
        try {
            const res = await fetch(`${API_URL}/players`);
            const data = await res.json();
            state.allPlayers = data;
            ui.renderPlayersTable(data);
        } catch (e) {
            console.error('Failed to fetch all players', e);
        }
    },

    viewMatchStats: (matchId, p1Name, p2Name, p1Id, p2Id, score1, score2, gameDataStr) => {
        ui.toggleScoreModal(true, matchId, p1Name, p2Name, p1Id, p2Id, true);
        
        document.getElementById('score-p1').value = score1;
        document.getElementById('score-p2').value = score2;

        try {
            const games = JSON.parse(decodeURIComponent(gameDataStr));
            if (games && games.length > 0 && games[0].stats) {
                const s1 = games[0].stats.find(s => s.playerId === p1Id);
                const s2 = games[0].stats.find(s => s.playerId === p2Id);
                if (s1) {
                    document.getElementById('stat-p1-apm').value = s1.apm || '';
                    document.getElementById('stat-p1-pps').value = s1.pps || '';
                    document.getElementById('stat-p1-vs').value = s1.vs || '';
                }
                if (s2) {
                    document.getElementById('stat-p2-apm').value = s2.apm || '';
                    document.getElementById('stat-p2-pps').value = s2.pps || '';
                    document.getElementById('stat-p2-vs').value = s2.vs || '';
                }
            }
        } catch(e) {}
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    ui.switchTab('dashboard');
});
