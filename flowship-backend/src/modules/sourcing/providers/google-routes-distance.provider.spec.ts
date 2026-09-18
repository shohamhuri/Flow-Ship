import { GoogleRoutesDistanceProvider } from './google-routes-distance.provider';

describe('GoogleRoutesDistanceProvider', () => {
    let provider: GoogleRoutesDistanceProvider;

    beforeEach(() => {
        provider = new GoogleRoutesDistanceProvider();

        process.env.GOOGLE_ROUTES_API_KEY = 'test-api-key';

        global.fetch = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return distance in km and duration in minutes', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                routes: [
                    {
                        distanceMeters: 12500,
                        duration: '900s',
                    },
                ],
            }),
        });

        const result = await provider.getDistance(
            {
                country: 'Israel',
                city: 'Tel Aviv',
                street: 'Dizengoff',
                houseNumber: '100',
            },
            {
                country: 'Israel',
                city: 'Rishon LeZion',
                street: 'Herzl',
                houseNumber: '50',
            },
        );

        expect(result).toEqual({
            distanceKm: 12.5,
            durationMinutes: 15,
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    it('should return zero distance when Google returns 0s duration without distanceMeters', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({
                routes: [
                    {
                        duration: '0s',
                    },
                ],
            }),
        });

        const result = await provider.getDistance(
            {
                country: 'Israel',
                city: 'Netivot',
                street: 'Industrial Area',
                houseNumber: '1',
            },
            {
                country: 'Israel',
                city: 'Netivot',
                street: 'HaShalom',
                houseNumber: '10',
                postalCode: '8770000',
            },
        );

        expect(result).toEqual({
            distanceKm: 0,
            durationMinutes: 0,
        });

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});