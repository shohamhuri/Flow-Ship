import { DeliveryCenterAdapter } from './delivery-center.adapter';

describe('DeliveryCenterAdapter', () => {
    let adapter: DeliveryCenterAdapter;

    beforeEach(() => {
        adapter = new DeliveryCenterAdapter();

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                price: 100,
            }),
        } as Response);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should use scooter when weight is below scooter max weight', async () => {
        await adapter.getQuote(
            {
                pickupCities: ['Tel Aviv'],
                destinationCity: 'Ramat Gan',
                weightKg: 2,
                pickupAddress: 'Dizengoff 1, Tel Aviv',
                destinationAddress: 'Bialik 1, Ramat Gan',
            },
            {
                settings: {
                    vehicleWeightRules: {
                        scooterMaxWeightKg: 10,
                        carMaxWeightKg: 50,
                    },
                    defaultUrgency: 'urgent',
                },
            },
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);

        expect(global.fetch).toHaveBeenCalledWith(
            'https://delivery.org.il/api/calculate-price',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pickup_address: 'Dizengoff 1, Tel Aviv',
                    delivery_address: 'Bialik 1, Ramat Gan',
                    vehicle_type: 'scooter',
                    urgency: 'urgent',
                }),
            }),
        );
    });
    it('should use car when weight is above scooter max weight and below car max weight', async () => {
        await adapter.getQuote(
            {
                pickupCities: ['Tel Aviv'],
                destinationCity: 'Ramat Gan',
                weightKg: 20,
                pickupAddress: 'Dizengoff 1, Tel Aviv',
                destinationAddress: 'Bialik 1, Ramat Gan',
            },
            {
                settings: {
                    vehicleWeightRules: {
                        scooterMaxWeightKg: 10,
                        carMaxWeightKg: 50,
                    },
                    defaultUrgency: 'urgent',
                },
            },
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);

        expect(global.fetch).toHaveBeenCalledWith(
            'https://delivery.org.il/api/calculate-price',
            expect.objectContaining({
                body: JSON.stringify({
                    pickup_address: 'Dizengoff 1, Tel Aviv',
                    delivery_address: 'Bialik 1, Ramat Gan',
                    vehicle_type: 'car',
                    urgency: 'urgent',
                }),
            }),
        );
    });
    it('should use commercial when weight is above car max weight', async () => {
        await adapter.getQuote(
            {
                pickupCities: ['Tel Aviv'],
                destinationCity: 'Ramat Gan',
                weightKg: 60,
                pickupAddress: 'Dizengoff 1, Tel Aviv',
                destinationAddress: 'Bialik 1, Ramat Gan',
            },
            {
                settings: {
                    vehicleWeightRules: {
                        scooterMaxWeightKg: 10,
                        carMaxWeightKg: 50,
                    },
                    defaultUrgency: 'urgent',
                },
            },
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);

        expect(global.fetch).toHaveBeenCalledWith(
            'https://delivery.org.il/api/calculate-price',
            expect.objectContaining({
                body: JSON.stringify({
                    pickup_address: 'Dizengoff 1, Tel Aviv',
                    delivery_address: 'Bialik 1, Ramat Gan',
                    vehicle_type: 'commercial',
                    urgency: 'urgent',
                }),
            }),
        );
    });
    it('should use default urgency from provider settings', async () => {
        await adapter.getQuote(
            {
                pickupCities: ['Tel Aviv'],
                destinationCity: 'Ramat Gan',
                weightKg: 2,
                pickupAddress: 'Dizengoff 1, Tel Aviv',
                destinationAddress: 'Bialik 1, Ramat Gan',
            },
            {
                settings: {
                    vehicleWeightRules: {
                        scooterMaxWeightKg: 10,
                        carMaxWeightKg: 50,
                    },
                    defaultUrgency: 'express',
                },
            },
        );

        expect(global.fetch).toHaveBeenCalledWith(
            'https://delivery.org.il/api/calculate-price',
            expect.objectContaining({
                body: JSON.stringify({
                    pickup_address: 'Dizengoff 1, Tel Aviv',
                    delivery_address: 'Bialik 1, Ramat Gan',
                    vehicle_type: 'scooter',
                    urgency: 'express',
                }),
            }),
        );
    });
    it('should prefer request vehicleType over weight rules', async () => {
        await adapter.getQuote(
            {
                pickupCities: ['Tel Aviv'],
                destinationCity: 'Ramat Gan',
                weightKg: 2,
                pickupAddress: 'Dizengoff 1, Tel Aviv',
                destinationAddress: 'Bialik 1, Ramat Gan',
                vehicleType: 'commercial',
            },
            {
                settings: {
                    vehicleWeightRules: {
                        scooterMaxWeightKg: 10,
                        carMaxWeightKg: 50,
                    },
                    defaultUrgency: 'urgent',
                },
            },
        );

        expect(global.fetch).toHaveBeenCalledWith(
            'https://delivery.org.il/api/calculate-price',
            expect.objectContaining({
                body: JSON.stringify({
                    pickup_address: 'Dizengoff 1, Tel Aviv',
                    delivery_address: 'Bialik 1, Ramat Gan',
                    vehicle_type: 'commercial',
                    urgency: 'urgent',
                }),
            }),
        );
    });
});