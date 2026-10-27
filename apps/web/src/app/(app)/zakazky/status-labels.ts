import type { WorkOrderStatus } from '@servisnik/domain/work-order';

export const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  received: 'Prijatá',
  done: 'Hotová',
  invoiced: 'Vyfakturovaná',
};
