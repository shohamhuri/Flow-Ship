import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';

import { CarrierCode } from '../enums/carrier-code.enum';

import {
    CarrierAdapter,
    CarrierQuoteOption,
    CarrierQuoteRequest,
    CarrierAdapterConfig,
} from '../interfaces/carrier-adapter.interface';

type DeliveryCenterResponse = {
    price: number;
    distance_km?: number;
    duration_minutes?: number;
};

@Injectable()
export class DeliveryCenterAdapter implements CarrierAdapter {

    code = CarrierCode.DELIVERY_CENTER;

    private readonly apiUrl =
        'https://delivery.org.il/api/calculate-price';

    async getQuote(
        request: CarrierQuoteRequest,
        config?: CarrierAdapterConfig,
    ): Promise<CarrierQuoteOption[]> {

        if (!request.pickupAddress) {
            throw new BadRequestException(
                'pickupAddress is required for Delivery Center',
            );
        }

        if (!request.destinationAddress) {
            throw new BadRequestException(
                'destinationAddress is required for Delivery Center',
            );
        }

        const settings = config?.settings as
            | {
                vehicleWeightRules?: {
                    scooterMaxWeightKg?: number;
                    carMaxWeightKg?: number;
                };
                defaultUrgency?: 'urgent' | 'express' | 'standard';
            }
            | undefined;

        const scooterMaxWeightKg =
            settings?.vehicleWeightRules?.scooterMaxWeightKg ?? 10;

        const carMaxWeightKg =
            settings?.vehicleWeightRules?.carMaxWeightKg ?? 50;

        const vehicleType =
            request.vehicleType ??
            (
                request.weightKg <= scooterMaxWeightKg
                    ? 'scooter'
                    : request.weightKg <= carMaxWeightKg
                        ? 'car'
                        : 'commercial'
            );

        const urgency =
            request.urgency ??
            settings?.defaultUrgency ??
            'urgent';
        const deliveryCenterBody = {
            pickup_address: request.pickupAddress,
            delivery_address: request.destinationAddress,
            vehicle_type: vehicleType,
            urgency,
        };


        const response = await fetch(
            this.apiUrl,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                },

                body: JSON.stringify(deliveryCenterBody),
            },
        );

        if (!response.ok) {
            const body = await response.text();

            throw new Error(
                `Delivery Center API failed (${response.status}): ${body}`,
            );
        }

        const data =
            (await response.json()) as DeliveryCenterResponse;

        if (
            typeof data.price !== 'number' ||
            !Number.isFinite(data.price)
        ) {
            throw new Error(
                'Delivery Center returned invalid price',
            );
        }

        return [
            {
                carrierName: 'Delivery Center',

                serviceName:
                    urgency === 'urgent'
                        ? 'Urgent Delivery'
                        : urgency === 'express'
                            ? 'Express Delivery'
                            : 'Standard Delivery',

                price: data.price,

                currency: 'ILS',
                estimatedDays:
                    urgency === 'standard'
                        ? 1
                        : 0,
            },
        ];
    }
}