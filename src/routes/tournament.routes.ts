import { Router } from 'express';
import { createTournament, generateBracket, getBracket, getRankings, getTournaments } from '../controllers/tournament.controller.js';

const router = Router();

router.get('/', getTournaments);
router.post('/', createTournament);
router.post('/:id/generate-bracket', generateBracket);
router.get('/:id/bracket', getBracket);
router.get('/:id/rankings', getRankings);

export default router;