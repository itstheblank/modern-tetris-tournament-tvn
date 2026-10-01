import { Router } from 'express';
import { getPlayerCareer, getAllPlayers } from '../controllers/player.controller.js';

const router = Router();

router.get('/', getAllPlayers);
router.get('/:id/career', getPlayerCareer);

export default router;
