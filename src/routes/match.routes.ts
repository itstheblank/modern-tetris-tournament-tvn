import { Router } from 'express';
import { getMatchHistory, updateScore, addGames } from '../controllers/match.controller.js';

const router = Router();

router.get('/', getMatchHistory);
router.put('/:id/score', updateScore);
router.post('/:id/games', addGames);

export default router;
