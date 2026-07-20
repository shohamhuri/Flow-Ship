import { Injectable } from '@nestjs/common';
import { MockCarrierAdapter } from './adapters/mock-carrier.adapter';
import { MockYangoAdapter } from './adapters/mock-yango.adapter';
import { CarrierCode } from './enums/carrier-code.enum';
import { CarrierAdapter } from './interfaces/carrier-adapter.interface';

@Injectable()
export class CarrierRegistry {
    private readonly adapters: Map<CarrierCode, CarrierAdapter>;

    constructor(
        private readonly mockCarrierAdapter: MockCarrierAdapter,
        private readonly mockYangoAdapter: MockYangoAdapter,
    ) {
        this.adapters = new Map<CarrierCode, CarrierAdapter>([
            [this.mockCarrierAdapter.code, this.mockCarrierAdapter],
            [this.mockYangoAdapter.code, this.mockYangoAdapter],
        ]);
    }

    getAdapter(code: CarrierCode): CarrierAdapter {
        const adapter = this.adapters.get(code);

        if (!adapter) {
            throw new Error(`Carrier adapter not found: ${code}`);
        }

        return adapter;
    }

    getAllAdapters(): CarrierAdapter[] {
        return Array.from(this.adapters.values());
    }
}