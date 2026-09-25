import type { GearId, ItemId } from '../core/types';

export const ITEMS: Record<ItemId | GearId, string> = {
  ration: '配給食', can: '缶詰', dogfood: 'ドッグフード',
  ball: '古いボール', blanket: '毛布', map: '管理塔周辺の地図',
};

/** 一度しか手に入らない道具 */
export const UNIQUE: readonly GearId[] = ['ball', 'blanket', 'map'];
export const isGear = (id: string): id is GearId => (UNIQUE as readonly string[]).includes(id);
