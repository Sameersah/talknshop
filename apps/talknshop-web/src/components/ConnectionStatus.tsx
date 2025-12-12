/**
 * Connection status indicator component
 */

import React from 'react';
import { WorkflowStage } from '../types';

interface ConnectionStatusProps {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  currentStage: WorkflowStage | null;
}

const stageLabels: Record<WorkflowStage, string> = {
  [WorkflowStage.INITIAL]: 'Starting',
  [WorkflowStage.MEDIA_PROCESSING]: 'Processing media',
  [WorkflowStage.REQUIREMENT_BUILDING]: 'Understanding request',
  [WorkflowStage.CLARIFICATION]: 'Need more info',
  [WorkflowStage.SEARCHING]: 'Searching products',
  [WorkflowStage.RANKING]: 'Ranking results',
  [WorkflowStage.COMPLETED]: 'Complete',
  [WorkflowStage.FAILED]: 'Failed',
};

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connected,
  connecting,
  error,
  currentStage,
}) => {
  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <div className="w-2 h-2 rounded-full bg-red-600"></div>
        <span className="text-sm font-medium">Error: {error}</span>
      </div>
    );
  }

  if (connecting) {
    return (
      <div className="flex items-center gap-2 text-yellow-600">
        <div className="w-2 h-2 rounded-full bg-yellow-600 animate-pulse"></div>
        <span className="text-sm font-medium">Connecting...</span>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
        <span className="text-sm font-medium">Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-green-600">
      <div className="w-2 h-2 rounded-full bg-green-600"></div>
      <div className="text-sm">
        <span className="font-medium">Connected</span>
        {currentStage && currentStage !== WorkflowStage.COMPLETED && (
          <span className="ml-2 text-gray-600">• {stageLabels[currentStage]}</span>
        )}
      </div>
    </div>
  );
};






