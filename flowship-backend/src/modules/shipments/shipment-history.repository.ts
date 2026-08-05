import { Injectable } from '@nestjs/common';

import {
    DbService,
} from '../../infrastructure/database/db.service';

import {
    CurrentTenant,
} from '../tenants/tenants.service';

export interface ShipmentHistoryShipment {
    id: string;

    externalShipmentId: string | null;
    shipmentGroupId: string | null;

    status: string;

    carrierName: string | null;
    serviceName: string | null;

    price: number | null;
    currency: string;

    trackingNumber: string | null;
    trackingUrl: string | null;

    pickup: Record<string, unknown> | null;
    dropoff: Record<string, unknown> | null;

    failureReason: string | null;
    deliveredAt: Date | string | null;
    failedAt: Date | string | null;

    createdAt: Date | string;
}
export interface ShipmentHistoryFilters {
    resultStatus?: 'delivered' | 'failed';

    carrierName?: string;
    search?: string;

    fromDate?: string;
    toDate?: string;

    sortBy?:
    | 'completedAt'
    | 'createdAt'
    | 'totalShippingPrice'
    | 'totalShipments';

    sortDirection?: 'asc' | 'desc';
}

export interface ShipmentHistoryItem {
    checkoutId: string;
    orderId: string;
    platform: string;

    resultStatus:
    | 'delivered'
    | 'failed';

    checkoutStatus: string;
    failureStage: string | null;
    failureReason: string | null;

    destination:
    Record<string, unknown>;

    totalShipments: number;
    deliveredShipments: number;
    failedShipments: number;

    totalShippingPrice: number;
    currency: string;

    createdAt: Date;
    completedAt: Date | null;

    shipments:
    ShipmentHistoryShipment[];
}

interface ShipmentHistoryRow {
    checkout_id: string;
    order_id: string;
    platform: string;

    result_status:
    | 'delivered'
    | 'failed';

    checkout_status: string;
    failure_stage: string | null;
    failure_reason: string | null;

    destination:
    Record<string, unknown>;

    total_shipments:
    string | number;

    delivered_shipments:
    string | number;

    failed_shipments:
    string | number;

    total_shipping_price:
    string | number;

    currency: string;

    created_at:
    Date | string;

    completed_at:
    Date | string | null;

    shipments:
    ShipmentHistoryShipment[];
}

@Injectable()
export class ShipmentHistoryRepository {
    constructor(
        private readonly db: DbService,
    ) { }

    async findFinalOrders(
        tenant: CurrentTenant,
        filters: ShipmentHistoryFilters = {},
    ): Promise<ShipmentHistoryItem[]> {
        const schemaName =
            this.safeSchemaName(
                tenant.schemaName,
            );

        const resultStatus =
            filters.resultStatus ?? null;

        const carrierName =
            filters.carrierName?.trim() || null;

        const search =
            filters.search?.trim() || null;

        const fromDate =
            filters.fromDate ?? null;

        const toDate =
            filters.toDate ?? null;

        const sortDirection =
            filters.sortDirection === 'asc'
                ? 'asc'
                : 'desc';

        const sortColumnMap: Record<
            NonNullable<
                ShipmentHistoryFilters['sortBy']
            >,
            string
        > = {
            completedAt: 'final_order.completed_at',
            createdAt: 'final_order.created_at',
            totalShippingPrice:
                'final_order.total_shipping_price',
            totalShipments:
                'final_order.total_shipments',
        };

        const sortBy =
            filters.sortBy ?? 'completedAt';

        const sortColumn =
            sortColumnMap[sortBy] ??
            sortColumnMap.completedAt;

        const rows =
            await this.db.query<ShipmentHistoryRow>(
                `
      with shipment_summary as (
        select
          shipment.checkout_id,

          count(*) as total_shipments,

          count(*) filter (
            where shipment.status = 'delivered'
          ) as delivered_shipments,

          count(*) filter (
            where shipment.status = 'failed'
          ) as failed_shipments,

          coalesce(
            sum(shipment.price),
            0
          ) as total_shipping_price,

          coalesce(
            max(shipment.currency),
            'ILS'
          ) as currency,

          max(
            shipment.delivered_at
          ) as delivered_at,

          max(
            shipment.failed_at
          ) as failed_at,

          max(
            shipment.failure_reason
          ) filter (
            where shipment.status = 'failed'
          ) as shipment_failure_reason,

          jsonb_agg(
            jsonb_build_object(
              'id',
              shipment.id,

              'externalShipmentId',
              shipment.external_shipment_id,

              'shipmentGroupId',
              shipment.shipment_group_id,

              'status',
              shipment.status,

              'carrierName',
              shipment.carrier_name,

              'serviceName',
              shipment.service_name,

              'price',
              shipment.price,

              'currency',
              shipment.currency,

              'trackingNumber',
              shipment.tracking_number,

              'trackingUrl',
              shipment.tracking_url,

              'pickup',
              coalesce(
                (
                  select stop.address
                  from "${schemaName}".shipment_stops stop
                  where
                    stop.shipment_id =
                      shipment.id
                    and stop.stop_type =
                      'pickup'
                  order by stop.stop_order asc
                  limit 1
                ),
                shipment.pickup
              ),

              'dropoff',
              coalesce(
                (
                  select stop.address
                  from "${schemaName}".shipment_stops stop
                  where
                    stop.shipment_id =
                      shipment.id
                    and stop.stop_type =
                      'dropoff'
                  order by stop.stop_order asc
                  limit 1
                ),
                shipment.dropoff
              ),

              'failureReason',
              shipment.failure_reason,

              'deliveredAt',
              shipment.delivered_at,

              'failedAt',
              shipment.failed_at,

              'createdAt',
              shipment.created_at
            )
            order by shipment.created_at asc
          ) as shipments

        from "${schemaName}".shipments shipment

        where
          shipment.checkout_id is not null

        group by shipment.checkout_id
      ),

      final_orders as (
        select
          checkout.id as checkout_id,

          coalesce(
            checkout.external_order_id,
            checkout.external_checkout_id,
            checkout.id::text
          ) as order_id,

          checkout.platform,

          case
            when
              processing.status = 'failed'

              or checkout.status in (
                'failed',
                'partially_failed'
              )

              or coalesce(
                summary.failed_shipments,
                0
              ) > 0

            then 'failed'

            else 'delivered'
          end as result_status,

          checkout.status
            as checkout_status,

          case
            when
              processing.status = 'failed'
            then processing.current_step

            when coalesce(
              summary.failed_shipments,
              0
            ) > 0
            then 'shipment_delivery'

            else null
          end as failure_stage,

          coalesce(
            summary.shipment_failure_reason,
            processing.error_message
          ) as failure_reason,

          checkout.destination,

          coalesce(
            summary.total_shipments,
            0
          ) as total_shipments,

          coalesce(
            summary.delivered_shipments,
            0
          ) as delivered_shipments,

          coalesce(
            summary.failed_shipments,
            0
          ) as failed_shipments,

          coalesce(
            summary.total_shipping_price,
            0
          ) as total_shipping_price,

          coalesce(
            summary.currency,
            'ILS'
          ) as currency,

          checkout.created_at,

          case
            when
              processing.status = 'failed'
            then processing.completed_at

            when coalesce(
              summary.failed_shipments,
              0
            ) > 0
            then summary.failed_at

            else summary.delivered_at
          end as completed_at,

          coalesce(
            summary.shipments,
            '[]'::jsonb
          ) as shipments

        from "${schemaName}".checkouts checkout

        left join
          "${schemaName}".checkout_processing
          processing
          on processing.checkout_id =
            checkout.id

        left join shipment_summary summary
          on summary.checkout_id =
            checkout.id

        where
          processing.status = 'failed'

          or checkout.status in (
            'failed',
            'partially_failed'
          )

          or coalesce(
            summary.failed_shipments,
            0
          ) > 0

          or (
            coalesce(
              summary.total_shipments,
              0
            ) > 0

            and summary.delivered_shipments =
              summary.total_shipments
          )
      )

      select
        final_order.checkout_id,
        final_order.order_id,
        final_order.platform,
        final_order.result_status,
        final_order.checkout_status,
        final_order.failure_stage,
        final_order.failure_reason,
        final_order.destination,
        final_order.total_shipments,
        final_order.delivered_shipments,
        final_order.failed_shipments,
        final_order.total_shipping_price,
        final_order.currency,
        final_order.created_at,
        final_order.completed_at,
        final_order.shipments

      from final_orders final_order

      where
        (
          $1::text is null
          or final_order.result_status = $1
        )

        and (
          $2::text is null

          or exists (
            select 1
            from "${schemaName}".shipments
              carrier_shipment
            where
              carrier_shipment.checkout_id =
                final_order.checkout_id

              and carrier_shipment.carrier_name
                ilike '%' || $2 || '%'
          )
        )

        and (
          $3::text is null

          or final_order.order_id
            ilike '%' || $3 || '%'

          or final_order.checkout_id::text
            ilike '%' || $3 || '%'

          or exists (
            select 1
            from "${schemaName}".shipments
              searched_shipment
            where
              searched_shipment.checkout_id =
                final_order.checkout_id

              and (
                searched_shipment.id::text
                  ilike '%' || $3 || '%'

                or coalesce(
                  searched_shipment
                    .tracking_number,
                  ''
                ) ilike '%' || $3 || '%'

                or coalesce(
                  searched_shipment
                    .external_shipment_id,
                  ''
                ) ilike '%' || $3 || '%'

                or coalesce(
                  searched_shipment
                    .carrier_name,
                  ''
                ) ilike '%' || $3 || '%'
              )
          )
        )

        and (
          $4::timestamptz is null
          or final_order.completed_at >=
            $4::timestamptz
        )

        and (
          $5::date is null
          or final_order.completed_at <
            (
              $5::date +
              interval '1 day'
            )
        )

      order by
        ${sortColumn}
        ${sortDirection}
        nulls last,

        final_order.created_at desc
      `,
                [
                    resultStatus,
                    carrierName,
                    search,
                    fromDate,
                    toDate,
                ],
            );

        return rows.map(
            (row): ShipmentHistoryItem => ({
                checkoutId:
                    row.checkout_id,

                orderId:
                    row.order_id,

                platform:
                    row.platform,

                resultStatus:
                    row.result_status,

                checkoutStatus:
                    row.checkout_status,

                failureStage:
                    row.failure_stage,

                failureReason:
                    row.failure_reason,

                destination:
                    row.destination ?? {},

                totalShipments:
                    Number(row.total_shipments),

                deliveredShipments:
                    Number(
                        row.delivered_shipments,
                    ),

                failedShipments:
                    Number(
                        row.failed_shipments,
                    ),

                totalShippingPrice:
                    Number(
                        row.total_shipping_price,
                    ),

                currency:
                    row.currency,

                createdAt:
                    new Date(row.created_at),

                completedAt:
                    row.completed_at
                        ? new Date(row.completed_at)
                        : null,

                shipments:
                    row.shipments ?? [],
            }),
        );
    }

    private safeSchemaName(
        schemaName: string,
    ): string {
        if (
            !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(
                schemaName,
            )
        ) {
            throw new Error(
                `Invalid schema name: ${schemaName}`,
            );
        }

        return schemaName;
    }
}