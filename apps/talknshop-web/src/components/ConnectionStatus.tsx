/**
 * Header status: dot + label, minimal footprint, accessible.
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
  [WorkflowStage.MEDIA_PROCESSING]: 'Processing',
  [WorkflowStage.REQUIREMENT_BUILDING]: 'Understanding',
  [WorkflowStage.CLARIFICATION]: 'Clarifying',
  [WorkflowStage.SEARCHING]: 'Searching',
  [WorkflowStage.RANKING]: 'Ranking',
  [WorkflowStage.COMPLETED]: 'Ready',
  [WorkflowStage.FAILED]: 'Failed',
};

function StatusPill({
  dotColor,
  label,
  labelClassName,
  title,
}: {
  dotColor: string;
  label: string;
  labelClassName: string;
  title?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 flex-shrink-0 min-w-0"
      title={title}
      role="status"
      aria-live="polite"
    >
      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${dotColor}`} aria-hidden />
      <span className={`text-xs font-medium truncate max-w-[120px] sm:max-w-[160px] ${labelClassName}`}>
        {label}
      </span>
    </div>
  );
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connected,
  connecting,
  error,
  currentStage,
}) => {
  if (error) {
    return (
      <StatusPill
        dotColor="bg-red-500"
        label={error}
        labelClassName="text-red-700"
        title={error}
      />
    );
  }

  if (connecting) {
    return (
      <StatusPill
        dotColor="bg-amber-500 animate-pulse"
        label="Connecting…"
        labelClassName="text-amber-700"
      />
    );
  }

  if (!connected) {
    return (
      <StatusPill
        dotColor="bg-gray-400"
        label="Offline"
        labelClassName="text-gray-600"
      />
    );
  }

  const label =
    currentStage && currentStage !== WorkflowStage.COMPLETED && currentStage !== WorkflowStage.INITIAL
      ? stageLabels[currentStage]
      : 'Ready';
  return (
    <StatusPill
      dotColor="bg-emerald-500"
      label={label}
      labelClassName="text-emerald-700"
    />
  );
};
