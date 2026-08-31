import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StickmanRun from './StickmanRun';
import SpaceDefender from './SpaceDefender';
import TowerOfRiddles from './TowerOfRiddles';
import BubblePopBlitz from './BubblePopBlitz';

export default function GameLauncherPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/student/events', { replace: true });
  };

  const normalized = (gameId || '').replace(/-/g, '_');

  switch (normalized) {
    case 'stickman_run':
    case 'weekly_run':
      return <StickmanRun onClose={handleClose} />;
    case 'space_blaster':
    case 'space_defender':
      return <SpaceDefender onClose={handleClose} />;
    case 'tower_of_riddles':
    case 'riddle_tower':
      return <TowerOfRiddles onClose={handleClose} />;
    case 'bubble_blitz':
    case 'bubble_pop':
      return <BubblePopBlitz onClose={handleClose} />;
    default:
      return <StickmanRun onClose={handleClose} />;
  }
}
