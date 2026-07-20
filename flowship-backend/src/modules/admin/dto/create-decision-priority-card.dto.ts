export class CreateDecisionPriorityCardDto {
    providerId?: string | null;
    criterionKey!: string;
    title?: string;
    isActive?: boolean;
    config?: Record<string, unknown>;
}