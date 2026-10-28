import type { WorkOrderStatus } from '@servisnik/domain/work-order';

export const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  received: 'Prijatá',
  inProgress: 'V práci',
  waitingForParts: 'Čaká na diely',
  done: 'Hotová',
  invoiced: 'Vyfakturovaná',
  cancelled: 'Zrušená',
};
