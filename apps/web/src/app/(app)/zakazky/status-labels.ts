import type { StatusFilter, WorkOrderStatus } from '@servisnik/domain/work-order';

export const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  received: 'Prijatá',
  inProgress: 'V práci',
  waitingForParts: 'Čaká na diely',
  done: 'Hotová',
  invoiced: 'Vyfakturovaná',
  cancelled: 'Zrušená',
};

/** What the filter of the list says: a status, or Neuzavreté (the default) or Všetky. */
export const statusFilterLabels: Record<StatusFilter, string> = { unclosed: 'Neuzavreté', all: 'Všetky', ...workOrderStatusLabels };
