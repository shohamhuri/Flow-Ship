import { RankedSupplySource } from '../../sourcing/interfaces/source-ranking.interface';
import { GroupingResult } from '../../grouping/interfaces/grouping-result.interface';
export interface ItemSourceAssignment {
    /**
     * מזהה זמני של שורת הפריט בתוך תוצאת ה-Sourcing.
     * השילוב של index ו-SKU מאפשר להבדיל גם בין שתי שורות
     * שונות שמכילות את אותו SKU.
     */
    itemIndex: number;

    sku: string;

    requestedQuantity: number;

    selectedSource: RankedSupplySource;
}

export interface ShipmentPlanCandidate {
    /**
     * מזהה זמני בלבד.
     * בהמשך, כאשר נשמור תוכניות במסד הנתונים,
     * יהיה לתוכנית UUID אמיתי.
     */
    id: string;

    assignments: ItemSourceAssignment[];

    /**
     * בשלב הראשון עדיין לא נוצרו Shipment Groups
     * ולא התקבלו הצעות מחיר.
     */
    grouping?: GroupingResult;
    metrics?: ShipmentPlanMetrics;


    status:
    | 'generated'
    | 'grouped'
    | 'evaluated'
    | 'rejected';
}

export interface ShipmentPlanGenerationResult {
    plans: ShipmentPlanCandidate[];

    /**
     * פריטים שאין להם אף מקור אספקה חוקי.
     * אם הרשימה אינה ריקה, אי אפשר ליצור תוכנית מלאה להזמנה.
     */
    unresolvedItems: Array<{
        itemIndex: number;
        sku: string;
        requestedQuantity: number;
    }>;

    statistics: {
        inputItemsCount: number;
        theoreticalCombinations: number;
        generatedPlansCount: number;
        generationLimitReached: boolean;
    };
}
export interface ShipmentPlanMetrics {
    shipmentCount: number;
    averageSourceScore: number;
    totalSourceScore: number;
}