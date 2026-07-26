import { SupplySource } from './supply-source.interface';

export interface ScoreBreakdown {
    priority: number;
    distance: number;
}

export interface RankedSupplySource {
    source: SupplySource;

    availableQuantity: number;
    requestedQuantity: number;

    hasEnoughStock: boolean;

    priorityScore: number;
    distanceScore: number;

    scoreBreakdown: ScoreBreakdown;

    totalScore: number;

    rejectionReasons: string[];
}

export interface ItemSourcingResult {
    sku: string;
    requestedQuantity: number;

    possibleSources: RankedSupplySource[];

    rejectedSources: RankedSupplySource[];

    selectedSource: RankedSupplySource | null;
}