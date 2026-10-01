import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

export const getTournaments = async (req: Request, res: Response) => {
    try {
        const tournaments = await prisma.tournament.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(tournaments);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createTournament = async (req: Request, res: Response) => {
    try {
        const { name, game, type, participants } = req.body;
        const tournament = await prisma.tournament.create({
            data: {
                name,
                game,
                type,
                participants: {
                    create: participants.map((p: any) => ({
                        seed: p.seed,
                        player: {
                            connectOrCreate: {
                                where: { name: p.name },
                                create: { name: p.name }
                            }
                        }
                    }))
                }
            },
            include: {
                participants: { include: { player: true } }
            }
        });
        res.json(tournament);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const generateBracket = async (req: Request, res: Response): Promise<any> => {
    try {
        const tournamentId = parseInt(req.params.id as string);
        const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId }
        });
        if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

        const participants = await prisma.tournamentParticipant.findMany({
            where: { tournamentId },
            orderBy: { seed: 'asc' },
        });

        if (tournament.type === 'ROUND_ROBIN') {
            const numPlayers = participants.length;
            // Insert a dummy (Id = -1) if the number of players is odd
            const totalParticipants = numPlayers % 2 === 0 ? numPlayers : numPlayers + 1;
            const totalRounds = totalParticipants - 1;
            const matchesPerRound = totalParticipants / 2;

            let currentParticipants = [...participants];
            if (numPlayers % 2 !== 0) {
                currentParticipants.push({ playerId: -1 } as any); //Dummy, bye
            }

            const matchPromises = [];

            for (let round = 1; round <= totalRounds; round++) {
                for (let i = 0; i < matchesPerRound; i++) {
                    const p1 = currentParticipants[i]!;
                    const p2 = currentParticipants[totalParticipants - 1 - i]!;

                    const isBye = p1.playerId === -1 || p2.playerId === -1;
                    const actualP1Id = p1.playerId !== -1 ? p1.playerId : null;
                    const actualP2Id = p2.playerId !== -1 ? p2.playerId : null;

                    matchPromises.push(
                        prisma.match.create({
                            data: {
                                tournamentId,
                                round,
                                isWinnersBracket: true,
                                player1Id: actualP1Id,
                                player2Id: actualP2Id,
                                status: isBye ? 'COMPLETED' : 'PENDING',
                                score1: p1?.playerId !== -1 && isBye ? 1 : 0,
                                score2: p2?.playerId !== -1 && isBye ? 1 : 0,
                            }
                        })
                    );
                }
                // Cố định người đầu tiên (index 0), xoay vòng những người còn lại
                const first = currentParticipants.shift()!;
                const second = currentParticipants.shift()!;
                currentParticipants.push(second);
                currentParticipants.unshift(first);
            }

            await Promise.all(matchPromises);
        } else {
            const numPlayers = participants.length;
            if (numPlayers < 2) return res.status(400).json({ error: 'Need at least 2 players' });

            let nextPowerOf2 = 1;
            while (nextPowerOf2 < numPlayers) nextPowerOf2 *= 2;

            const S = nextPowerOf2;
            const totalWBRounds = Math.log2(S);
            const numByes = S - numPlayers;

            const wbMatchesByRound: any[][] = [];

            // 1. TẠO NHÁNH THẮNG (WINNERS BRACKET)
            for (let r = totalWBRounds; r >= 1; r--) {
                const numMatchesInRound = Math.pow(2, totalWBRounds - r);
                const currentRoundMatches = [];
                for (let i = 0; i < numMatchesInRound; i++) {
                    const nextMatchIndex = totalWBRounds - r - 1;
                    const nextMatch = (r === totalWBRounds) ? null : wbMatchesByRound[nextMatchIndex]![Math.floor(i / 2)];
                    const match = await prisma.match.create({
                        data: {
                            tournamentId,
                            round: r,
                            isWinnersBracket: true,
                            nextMatchId: nextMatch ? nextMatch.id : null
                        }
                    });
                    currentRoundMatches.push(match);
                }
                wbMatchesByRound.push(currentRoundMatches);
            }

            // 2. TẠO NHÁNH THUA (LOSERS BRACKET) & CHUNG KẾT TỔNG (Nếu là DOUBLE)
            if (tournament.type === 'DOUBLE') {
                const lbMatchesByRound: any[][] = [];
                const lbRoundsCount = (totalWBRounds - 1) * 2;

                for (let i = lbRoundsCount - 1; i >= 0; i--) {
                    const numMatches = S / Math.pow(2, Math.floor(i / 2) + 2);
                    const currentRoundMatches = [];
                    for (let j = 0; j < numMatches; j++) {
                        let nextMatchId = null;
                        if (i < lbRoundsCount - 1) {
                            const nextLBRound = lbMatchesByRound[0];
                            nextMatchId = (i % 2 === 0) ? nextLBRound![j]!.id : nextLBRound![Math.floor(j / 2)]!.id;
                        }
                        const match = await prisma.match.create({
                            data: {
                                tournamentId,
                                round: i + 1,
                                isWinnersBracket: false,
                                nextMatchId
                            }
                        });
                        currentRoundMatches.push(match);
                    }
                    lbMatchesByRound.unshift(currentRoundMatches);
                }

                // Tạo trận Chung Kết Tổng (Grand Final)
                const grandFinal = await prisma.match.create({
                    data: {
                        tournamentId,
                        round: totalWBRounds + 1,
                        isWinnersBracket: true,
                    }
                });

                // Nối Winner Final và Loser Final vào Grand Final
                await prisma.match.update({
                    where: { id: wbMatchesByRound[0]![0]!.id },
                    data: { nextMatchId: grandFinal.id }
                });
                await prisma.match.update({
                    where: { id: lbMatchesByRound[lbRoundsCount - 1]![0]!.id },
                    data: { nextMatchId: grandFinal.id }
                });

                // Nối người THUA ở Nhánh Thắng rớt xuống Nhánh Thua
                const w1Index = totalWBRounds - 1;
                // Vòng 1 WB -> Vòng 1 LB
                for (let j = 0; j < wbMatchesByRound[w1Index]!.length; j++) {
                    await prisma.match.update({
                        where: { id: wbMatchesByRound[w1Index]![j]!.id },
                        data: { nextLoserMatchId: lbMatchesByRound[0]![Math.floor(j / 2)]!.id }
                    });
                }
                for (let r = 2; r <= totalWBRounds; r++) {
                    const wIndex = totalWBRounds - r;
                    const lbIndex = (r - 1) * 2 - 1;
                    const matchCount = wbMatchesByRound[wIndex]!.length;
                    for (let j = 0; j < matchCount; j++) {
                        // Crossover for even rounds (WB R2, WB R4, etc) to prevent immediate rematches
                        const dropIndex = (r % 2 === 0) ? (matchCount - 1 - j) : j;
                        await prisma.match.update({
                            where: { id: wbMatchesByRound[wIndex]![j]!.id },
                            data: {
                                nextLoserMatchId: lbMatchesByRound[lbIndex]![dropIndex]!.id
                            }
                        });
                    }
                }
            }

            // 3. ĐIỀN NGƯỜI CHƠI VÀO VÒNG 1
            const round1Matches = wbMatchesByRound[totalWBRounds - 1]!;

            // Tạo mảng Seeding theo chuẩn eSports (vd: [1, 8, 4, 5, 2, 7, 3, 6])
            const seeds = [1];
            for (let i = 1; i <= totalWBRounds; i++) {
                const nextSeeds = [];
                const sum = Math.pow(2, i) + 1;
                for (const seed of seeds) {
                    nextSeeds.push(seed);
                    nextSeeds.push(sum - seed);
                }
                seeds.length = 0;
                seeds.push(...nextSeeds);
            }

            for (let i = 0; i < round1Matches.length; i++) {
                const s1 = seeds[i * 2]!;
                const s2 = seeds[i * 2 + 1]!;

                if (s1 > numPlayers || s2 > numPlayers) {
                    // BYE
                    const realSeed = s1 > numPlayers ? s2 : s1;
                    const p1Id = participants[realSeed - 1]!.playerId; // participants is 0-indexed

                    await prisma.match.update({
                        where: { id: round1Matches[i]!.id },
                        data: {
                            player1Id: p1Id,
                            status: 'COMPLETED',
                            score1: 1
                        }
                    });

                    if (round1Matches[i]!.nextMatchId) {
                        const isEven = i % 2 === 0;
                        await prisma.match.update({
                            where: { id: round1Matches[i]!.nextMatchId! },
                            data: isEven ? { player1Id: p1Id } : { player2Id: p1Id }
                        });
                    }
                } else {
                    // MATCH
                    const p1Id = participants[s1 - 1]!.playerId;
                    const p2Id = participants[s2 - 1]!.playerId;

                    await prisma.match.update({
                        where: { id: round1Matches[i]!.id },
                        data: { player1Id: p1Id, player2Id: p2Id }
                    });
                }
            }
        }

        await prisma.tournament.update({
            where: { id: tournamentId },
            data: { status: "IN_PROGRESS" }
        });

        res.json({ message: 'Bracket generated successfully with all rounds' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getBracket = async (req: Request, res: Response) => {
    try {
        const tournamentId = parseInt(req.params.id as string);
        const matches = await prisma.match.findMany({
            where: { tournamentId },
            orderBy: [
                { isWinnersBracket: 'desc' },
                { round: 'asc' }
            ],
            include: {
                tournament: true,
                player1: true,
                player2: true,
                games: { include: { stats: true } }
            }
        });
        res.json(matches);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getRankings = async (req: Request, res: Response): Promise<any> => {
    try {
        const tournamentId = parseInt(req.params.id as string);
        const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId }
        });

        if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

        const matches = await prisma.match.findMany({
            where: { tournamentId, status: 'COMPLETED' },
            include: { player1: true, player2: true }
        });

        const rankings: { rank: number, player: string, playerId: number }[] = [];

        if (tournament.type === 'ROUND_ROBIN') {
            const participants = await prisma.tournamentParticipant.findMany({
                where: { tournamentId },
                include: { player: true }
            });

            const playerStats: Record<number, any> = {};
            participants.forEach(p => {
                playerStats[p.playerId] = {
                    matchWins: 0,
                    gameWins: 0,
                    participantId: p.id,
                    playerName: p.player.name
                };
            });

            matches.forEach(m => {
                if (m.player1Id && m.player2Id) {
                    if (m.score1 > m.score2) playerStats[m.player1Id].matchWins++;
                    else if (m.score2 > m.score1) playerStats[m.player2Id].matchWins++;

                    playerStats[m.player1Id].gameWins += m.score1;
                    playerStats[m.player2Id].gameWins += m.score2;
                }
            });

            const sortedPlayers = Object.keys(playerStats).sort((a, b) => {
                const statA = playerStats[parseInt(a)];
                const statB = playerStats[parseInt(b)];
                if (statB.matchWins !== statA.matchWins) return statB.matchWins - statA.matchWins;
                return statB.gameWins - statA.gameWins;
            });

            sortedPlayers.forEach((playerId, index) => {
                rankings.push({
                    rank: index + 1,
                    player: playerStats[parseInt(playerId)].playerName,
                    playerId: parseInt(playerId)
                });
            });
        } else {
            //Find Grand Final
            const grandFinal = matches.find(m => !m.nextMatchId && m.isWinnersBracket);
            if (grandFinal) {
                const winnerId = grandFinal.score1 > grandFinal.score2 ? grandFinal.player1Id : grandFinal.player2Id;
                const loserId = grandFinal.score1 > grandFinal.score2 ? grandFinal.player2Id : grandFinal.player1Id;

                const winner = grandFinal.player1Id === winnerId ? grandFinal.player1 : grandFinal.player2;
                const loser = grandFinal.player1Id === loserId ? grandFinal.player1 : grandFinal.player2;

                if (winner && winnerId) rankings.push({ rank: 1, player: winner.name, playerId: winnerId });
                if (loser && loserId) rankings.push({ rank: 2, player: loser.name, playerId: loserId });
            }

            if (tournament.type === 'SINGLE') {
                const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0;
                for (const m of matches) {
                    if (m.id === grandFinal?.id) continue;
                    // Calculate rank based on round eliminated
                    const rank = Math.pow(2, maxRound - m.round) + 1;
                    const loserId = m.score1 > m.score2 ? m.player2Id : (m.score2 > m.score1 ? m.player1Id : null);

                    if (loserId) {
                        const loser = m.player1Id === loserId ? m.player1 : m.player2;
                        if (loser) rankings.push({ rank, player: loser.name, playerId: loserId });
                    }
                }
            } else if (tournament.type === 'DOUBLE') {
                const lbMatches = matches.filter(m => !m.isWinnersBracket);
                if (lbMatches.length > 0) {
                    const maxLBRound = Math.max(...lbMatches.map(m => m.round));
                    let currentRank = 3;

                    for (let r = maxLBRound; r >= 1; r--) {
                        const matchesInRound = lbMatches.filter(m => m.round === r);
                        for (const m of matchesInRound) {
                            const loserId = m.score1 > m.score2 ? m.player2Id : (m.score2 > m.score1 ? m.player1Id : null);
                            if (loserId) {
                                const loser = m.player1Id === loserId ? m.player1 : m.player2;
                                if (loser) rankings.push({ rank: currentRank, player: loser.name, playerId: loserId });
                            }
                        }
                        currentRank += matchesInRound.length;
                    }
                }
            }
        }

        // Lưu finalRank vào Database
        for (const r of rankings) {
            await prisma.tournamentParticipant.updateMany({
                where: { tournamentId, playerId: r.playerId },
                data: { finalRank: r.rank }
            });
        }

        // Sort the final rankings và trả về cho API
        const response = rankings.map(r => ({ rank: r.rank, player: r.player }));
        response.sort((a, b) => a.rank - b.rank);
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};