export const HIDDEN_DEMO_FARM_ID = 'demo-farm-001';

export function isSelectableFarm(farm: { id: string; status: string }): boolean {
  return farm.status === 'ACTIVE' && farm.id !== HIDDEN_DEMO_FARM_ID;
}
