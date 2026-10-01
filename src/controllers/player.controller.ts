import type { Request, Response } from 'express';
import { prisma } from '../prisma.js';

export const getAllPlayers = async (req: Request, res: Response) => {
    try {
        const players = await prisma.player.findMany({
            orderBy: { id: 'asc' }
        });
        res.json(players);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const syncPlayerCareer = async (playerId: number) => {
    const matchesAsP1 = await prisma.match.findMany({ where: { player1Id: playerId, status: 'COMPLETED' } });
    const matchesAsP2 = await prisma.match.findMany({ where: { player2Id: playerId, status: 'COMPLETED' } });
    
    let matchWins = 0;
    let matchLosses = 0;
    let gameWins = 0;
    let gameLosses = 0;
    
    matchesAsP1.forEach((m: any) => {
        if (m.player1Id && m.player2Id) {
            m.score1 > m.score2 ? matchWins++ : matchLosses++;
            gameWins += m.score1 || 0;
            gameLosses += m.score2 || 0;
        }
    });
    
    matchesAsP2.forEach((m: any) => {
        if (m.player1Id && m.player2Id) {
            m.score2 > m.score1 ? matchWins++ : matchLosses++;
            gameWins += m.score2 || 0;
            gameLosses += m.score1 || 0;
        }
    });

    const stats = await prisma.gameStats.aggregate({
        where: { playerId },
        _avg: { apm: true, pps: true, vs: true }
    });

    await prisma.player.update({
        where: { id: playerId },
        data: {
            matchWins,
            matchLosses,
            gameWins,
            gameLosses,
            avgApm: stats._avg.apm ? Math.round(stats._avg.apm * 100) / 100 : 0,
            avgPps: stats._avg.pps ? Math.round(stats._avg.pps * 100) / 100 : 0,
            avgVs: stats._avg.vs ? Math.round(stats._avg.vs * 100) / 100 : 0
        }
    });
};

export const getPlayerCareer = async (req: Request, res: Response) => {
    try {
        const playerId = parseInt(req.params.id as string);
        await syncPlayerCareer(playerId);
        const { tournamentId, startDate, endDate } = req.query;

        const filter: any = {};
        if (tournamentId) filter.tournamentId = parseInt(String(tournamentId));
        if (startDate || endDate) {
            filter.tournament = {
                createdAt: {
                    ...(startDate ? { gte: new Date(String(startDate)) } : {}),
                    ...(endDate ? { lte: new Date(String(endDate)) } : {})
                }
            };
        }

        const matchesAsP1 = await prisma.match.findMany({ where: { player1Id: playerId, status: 'COMPLETED', ...filter } });
        const matchesAsP2 = await prisma.match.findMany({ where: { player2Id: playerId, status: 'COMPLETED', ...filter } });
        
        let matchWins = 0;
        let matchLosses = 0;
        let gameWins = 0;
        let gameLosses = 0;
        
        matchesAsP1.forEach((m: any) => {
            if (m.player1Id && m.player2Id) {
                m.score1 > m.score2 ? matchWins++ : matchLosses++;
                gameWins += m.score1 || 0;
                gameLosses += m.score2 || 0;
            }
        });
        
        matchesAsP2.forEach((m: any) => {
            if (m.player1Id && m.player2Id) {
                m.score2 > m.score1 ? matchWins++ : matchLosses++;
                gameWins += m.score2 || 0;
                gameLosses += m.score1 || 0;
            }
        });

        const gameStatsWhere = {
            playerId,
            game: { match: filter }
        };

        const stats = await prisma.gameStats.aggregate({
            where: gameStatsWhere,
            _avg: { apm: true, pps: true, vs: true }
        });

        const player = await prisma.player.findUnique({
            where: { id: playerId }
        });

        res.json({
            player,
            careerStats: {
                matches: {
                    total: matchWins + matchLosses,
                    wins: matchWins,
                    losses: matchLosses
                },
                games: {
                    total: gameWins + gameLosses,
                    wins: gameWins,
                    losses: gameLosses
                },
                avgApm: stats._avg.apm?.toFixed(2) || 0,
                avgPps: stats._avg.pps?.toFixed(2) || 0,
                avgVs: stats._avg.vs?.toFixed(2) || 0,
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};