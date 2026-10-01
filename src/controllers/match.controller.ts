import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

export const getMatchHistory = async (req: Request, res: Response) => {
    try {
        const { game } = req.query;

        const matches = await prisma.match.findMany({
            where: {
                status: 'COMPLETED',
                ...(game ? { tournament: { game: String(game) } } : {})
            },
            include: {
                tournament: true,
                games: { include: { stats: true } }
            }
        });

        const matchHistory = matches.map((match: any) => {
            let totalApm = 0, totalPps = 0, totalVs = 0, statCount = 0;

            match.games.forEach((g: any) => {
                g.stats.forEach((s: any) => {
                    if (s.apm) totalApm += s.apm;
                    if (s.pps) totalPps += s.pps;
                    if (s.vs) totalVs += s.vs;
                    statCount++;
                });
            });

            return {
                matchId: match.id,
                tournamentName: match.tournament.name,
                game: match.tournament.game,
                score: `${match.score1} - ${match.score2}`,
                avgApm: statCount > 0 ? (totalApm / statCount).toFixed(2) : 0,
                avgPps: statCount > 0 ? (totalPps / statCount).toFixed(2) : 0,
                avgVs: statCount > 0 ? (totalVs / statCount).toFixed(2) : 0,
            };
        });

        res.json(matchHistory);

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateScore = async (req: Request, res: Response): Promise<any> => {
    try {
        const matchId = parseInt(req.params.id as string);
        const { score1, score2, status } = req.body;

        const currentMatch = await prisma.match.findUnique({
            where: { id: matchId }
        });

        if (!currentMatch) return res.status(404).json({ error: "Match not found" });

        // VALIDATION 1: Check if any pending matches feed into this one
        const feedingMatches = await prisma.match.findMany({
            where: {
                OR: [
                    { nextMatchId: matchId },
                    { nextLoserMatchId: matchId }
                ],
                status: 'PENDING'
            }
        });

        if (feedingMatches.length > 0) {
            return res.status(400).json({
                error: 'Cannot update score yet. Waiting for previous matches to complete.'
            });
        }

        // VALIDATION 2: Check if match has at least 1 player
        if (!currentMatch.player1Id && !currentMatch.player2Id) {
            return res.status(400).json({
                error: 'Cannot update score for a match with no players.'
            });
        }

        const match = await prisma.match.update({
            where: { id: matchId },
            data: { score1, score2, status }
        });

        if (status === 'COMPLETED') {
            const winnerId = score1 > score2 ? match.player1Id : (score2 > score1 ? match.player2Id : null);
            const loserId = score1 > score2 ? match.player2Id : (score2 > score1 ? match.player1Id : null);

            // Advance Winner
            if (match.nextMatchId && winnerId) {
                const nextMatch = await prisma.match.findUnique({ where: { id: match.nextMatchId } });
                if (nextMatch) {
                    if (!nextMatch.player1Id && nextMatch.player2Id !== winnerId) {
                        await prisma.match.update({ where: { id: nextMatch.id }, data: { player1Id: winnerId } });
                    } else if (!nextMatch.player2Id && nextMatch.player1Id !== winnerId) {
                        await prisma.match.update({ where: { id: nextMatch.id }, data: { player2Id: winnerId } });
                    }
                }
            }

            // Advance Loser (Only for DOUBLE elim and only if nextLoserMatchId exists)
            if (match.nextLoserMatchId && loserId) {
                const nextLoserMatch = await prisma.match.findUnique({ where: { id: match.nextLoserMatchId } });
                if (nextLoserMatch) {
                    if (!nextLoserMatch.player1Id && nextLoserMatch.player2Id !== loserId) {
                        await prisma.match.update({ where: { id: nextLoserMatch.id }, data: { player1Id: loserId } });
                    } else if (!nextLoserMatch.player2Id && nextLoserMatch.player1Id !== loserId) {
                        await prisma.match.update({ where: { id: nextLoserMatch.id }, data: { player2Id: loserId } });
                    }
                }
            }

            // Check if tournament is completed
            const pendingMatches = await prisma.match.count({
                where: { tournamentId: match.tournamentId, status: 'PENDING' }
            });
            if (pendingMatches === 0) {
                await prisma.tournament.update({
                    where: { id: match.tournamentId },
                    data: { status: 'COMPLETED' }
                });
            }
        }

        res.json(match);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const addGames = async (req: Request, res: Response): Promise<any> => {
    try {
        const matchId = parseInt(req.params.id as string);
        const { games } = req.body;

        const match = await prisma.match.findUnique({ where: { id: matchId } });
        if (!match) return res.status(404).json({ error: "Match not found" });

        // Optimizing N+1 Queries: Create all games and stats within a single transaction
        await prisma.match.update({
            where: { id: matchId },
            data: {
                games: {
                    create: games.map((gameData: any, index: number) => ({
                        gameNumber: index + 1,
                        stats: {
                            create: gameData.stats.map((s: any) => ({
                                playerId: s.playerId,
                                apm: s.apm,
                                pps: s.pps,
                                vs: s.vs,
                                isWinner: s.isWinner
                            }))
                        }
                    }))
                }
            }
        });

        res.json({ message: "Games added successfully" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};