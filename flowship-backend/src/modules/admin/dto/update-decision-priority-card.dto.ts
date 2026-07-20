export class UpdateDecisionPriorityCardDto {
    providerId?: string | null;
    criterionKey?: string;
    title?: string;
    priorityRank?: number;
    isActive?: boolean;
    config?: Record<string, unknown>;
}