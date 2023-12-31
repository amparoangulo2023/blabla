import type { Restock, Stock } from "@blahaj-app/database";
import type { Selectable } from "kysely";
import pinInStock from "./media/pins/pin-in-stock.svg?dataurl";
import pinLowStock from "./media/pins/pin-low-stock.svg?dataurl";
import pinOutOfStock from "./media/pins/pin-out-of-stock.svg?dataurl";
import pinRestockExpected from "./media/pins/pin-restock-expected.svg?dataurl";
import pinUnknown from "./media/pins/pin-unknown.svg?dataurl";

export enum StockStatus {
  IN_STOCK,
  LOW_STOCK,
  OUT_OF_STOCK,
  RESTOCK_EXPECTED,
  UNKNOWN,
}

export const stockStyles: Record<StockStatus, { pin: string; color: string }> = {
  [StockStatus.IN_STOCK]: {
    pin: pinInStock,
    color: "#2ed573",
  },
  [StockStatus.LOW_STOCK]: {
    pin: pinLowStock,
    color: "#ffa502",
  },
  [StockStatus.OUT_OF_STOCK]: {
    pin: pinOutOfStock,
    color: "#ff4757",
  },
  [StockStatus.RESTOCK_EXPECTED]: {
    pin: pinRestockExpected,
    color: "#5352ed",
  },
  [StockStatus.UNKNOWN]: {
    pin: pinUnknown,
    color: "#747d8c",
  },
};

export const getStockStatus = (
  stocks: Pick<Selectable<Stock>, "quantity"> | undefined,
  restocks: Pick<Selectable<Restock>, "quantity">[] | undefined,
): StockStatus => {
  const quantity = stocks?.quantity;

  let status: StockStatus = StockStatus.UNKNOWN;
  if (typeof quantity === "number") {
    status = StockStatus.LOW_STOCK;

    if (quantity >= 15) {
      status = StockStatus.IN_STOCK;
    } else if (quantity === 0) {
      status = StockStatus.OUT_OF_STOCK;

      if (restocks && restocks.length > 0) {
        status = StockStatus.RESTOCK_EXPECTED;
      }
    }
  } else if (restocks && restocks.length > 0) {
    status = StockStatus.RESTOCK_EXPECTED;
  }

  return status;
};
