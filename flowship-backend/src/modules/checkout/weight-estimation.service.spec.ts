import { WeightEstimationService } from './weight-estimation.service';
import {
    WeightEstimationRepository,
    WeightEstimationRule,
} from './weight-estimation.repository';

describe('WeightEstimationService', () => {
    let service: WeightEstimationService;

    beforeEach(() => {
        const repository =
            {} as WeightEstimationRepository;

        service =
            new WeightEstimationService(
                repository,
            );
    });

    it('should match weight estimation rules case-insensitively', () => {
        const rules: WeightEstimationRule[] = [
            {
                id: 'rule-1',
                category: 'clothing',
                productType: 'shirt',
                size: 'S',
                estimatedWeightKg: 0.25,
                priority: 10,
            },
        ];

        const result =
            service.findBestMatchingRule(
                rules,
                ' CLOTHING',
                ' SHIRT',
                '  s',
            );

        expect(result).not.toBeNull();
        expect(result?.id).toBe('rule-1');
        expect(
            result?.estimatedWeightKg,
        ).toBe(0.25);
    });
});