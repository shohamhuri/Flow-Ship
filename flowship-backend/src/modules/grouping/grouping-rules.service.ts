import { Injectable } from '@nestjs/common';

@Injectable()
export class GroupingRulesService {
    getHandlingGroup(category?: string): string {
        if (!category) {
            return 'standard';
        }

        const normalizedCategory = category
            .trim()
            .toLowerCase();

        switch (normalizedCategory) {
            case 'frozen':
            case 'refrigerated':
            case 'cold':
                return 'cold-chain';

            case 'hazardous':
            case 'dangerous-goods':
                return 'hazardous';

            case 'fragile':
                return 'fragile';

            default:
                return 'standard';
        }
    }
}