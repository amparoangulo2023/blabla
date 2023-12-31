import type { CacheStorage, Response as CFResponse, Request as CFRequest } from "@cloudflare/workers-types";
import poppinsLight from "@fontsource/poppins/files/poppins-all-300-normal.woff?binary";
import poppinsRegular from "@fontsource/poppins/files/poppins-all-400-normal.woff?binary";
import poppinsMedium from "@fontsource/poppins/files/poppins-all-500-normal.woff?binary";
import poppinsSemiBold from "@fontsource/poppins/files/poppins-all-600-normal.woff?binary";
import poppinsBold from "@fontsource/poppins/files/poppins-all-700-normal.woff?binary";
import type { LoaderArgs } from "@remix-run/cloudflare";
import { curveCatmullRom } from "@visx/curve";
import { scaleLinear, scaleTime } from "@visx/scale";
import { area } from "@visx/shape";
import setNumOrAccessor from "@visx/shape/lib/util/setNumberOrNumberAccessor";
import { extent, max } from "d3-array";
import { subDays } from "date-fns";
import type { ReactNode } from "react";
import { badRequest, notFound, serverError } from "remix-utils";
import type SatoriType from "satori";
import type { StockChartDatum } from "../components/map/stock-history-chart";
import blahaj from "../media/blahaj.png?dataurl";
import { getMapImageResolver } from "../media/map-images";
import mapboxLogo from "../media/mapbox.svg?dataurl";
import { getStockStatus, stockStyles } from "../stock-status";
import findStore from "../utils/find-store";
import formatTz from "../utils/format-tz";
import getDatabase from "../utils/get-database";
import getStoreCountryDatum from "../utils/get-store-country-datum";
import { ITEM_NAME } from "../utils/item-names";
import parseSearchParams from "../utils/parse-search-params";
import { EmbedOgSearchParamsSchema } from "../zod/embed-og-search-params";

/* eslint-disable jsx-a11y/alt-text */

export type { EmbedOgSearchParams as SearchParams } from "../zod/embed-og-search-params";

let initalized = false;
const initalize = async () => {
  if (initalized) return;

  const [{ init }, { default: yoga }] = await Promise.all([import("satori/wasm"), import("yoga-wasm-web/asm")]);
  // @ts-expect-error missing types
  init(yoga());

  initalized = true;
};

export const loader = async ({ params, request, context }: LoaderArgs) => {
  const result = parseSearchParams(request, EmbedOgSearchParamsSchema);

  if (!result.success) {
    throw badRequest("Invalid Parameters");
  }

  const options = result.data;

  const cache = (caches as unknown as CacheStorage).default;
  const cacheUrl = new URL("https://example.com");
  cacheUrl.searchParams.set("key", "og-" + JSON.stringify(options));
  const cacheRequest = new Request(cacheUrl.toString()) as unknown as CFRequest;

  const match = await cache.match(cacheRequest);
  if (match) {
    return match;
  }

  const db = getDatabase(context);
  const satoriPromise = Promise.all([
    import("satori/wasm").then((m) => m.default as typeof SatoriType),
    initalize(),
  ]).then(([satori]) => satori);

  let markup: ReactNode;
  if (options.type === "map_store") {
    const getMapImage = getMapImageResolver(request.url);

    const storeId = options.storeId;
    const item = options.item;

    const store = findStore(options.storeId);

    if (!store) {
      throw notFound("Store not found");
    }

    const country = getStoreCountryDatum(store);

    const [stocks, [nextRestock], imageUrl] = await Promise.all([
      db
        .selectFrom("stock")
        .select(["quantity", "reported_at"])
        .where("store_id", "=", storeId)
        .where("type", "=", item)
        .where("created_at", ">", subDays(new Date(), 90))
        .orderBy("created_at", "asc")
        .execute(),
      db
        .selectFrom("restock")
        .select(["quantity", "reported_at", "earliest", "latest"])
        .where("type", "=", item)
        .where("store_id", "=", storeId)
        .orderBy("earliest", "desc")
        .limit(1)
        .execute(),
      getMapImage(storeId),
    ]).catch((error) => {
      throw serverError(error);
    });

    const currentStock = stocks[stocks.length - 1];

    const stockStyle = stockStyles[getStockStatus(currentStock, nextRestock ? [nextRestock] : [])];

    const chartWidth = 325;
    const chartHeight = 128;

    const getDate = (d: StockChartDatum) => new Date(d.reported_at);
    const getStockQuantity = (d: StockChartDatum) => d.quantity;

    const dateScale = scaleTime({
      range: [0, chartWidth],
      domain: extent(stocks, getDate) as [Date, Date],
    });

    const stockValueScale = scaleLinear({
      range: [chartHeight, chartHeight / 6],
      domain: [-1, Math.max(max(stocks, getStockQuantity) ?? 0, 10)],
      nice: true,
    });

    const path = area<StockChartDatum>({
      curve: curveCatmullRom,
      x: (d) => dateScale(getDate(d)) ?? 0,
    });

    path.y0(stockValueScale.range()[0]);
    setNumOrAccessor(path.y1, (d) => stockValueScale(getStockQuantity(d) ?? 0));

    markup = (
      <div tw="flex h-full w-full bg-white">
        <div tw="flex flex-col flex-grow">
          <div tw="flex items-center mx-auto mt-4 mb-2.5">
            <img src={blahaj} width={55} height={55} />
            <div tw="flex text-[32px] font-bold -mb-[8px] ml-1 text-gray-800">blahaj.app</div>
          </div>
          <div tw="flex-grow flex flex-col text-white max-w-[325px]" style={{ backgroundColor: stockStyle.color }}>
            <div tw="flex flex-col p-6 py-5">
              <div tw="text-[20px] font-semibold">{country.name}</div>
              <div tw="text-[32px] font-bold leading-[0.8]">{store.name}</div>
            </div>
            <div tw="flex py-3 bg-black/15">
              <div tw="flex mx-auto text-[20px] font-bold -mb-[8px]">{ITEM_NAME[item]} Inventory</div>
            </div>
            <div tw="flex h-32 bg-black/10">
              <svg width="365" height="128">
                <defs>
                  <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(255, 255, 255, 0.7)" stop-opacity="1"></stop>
                    <stop offset="100%" stop-color="rgba(255, 255, 255, 0.075)" stop-opacity="1"></stop>
                  </linearGradient>
                </defs>
                <path
                  stroke-width="2"
                  stroke="url(#area-gradient)"
                  fill="url(#area-gradient)"
                  d={path(stocks) ?? ""}
                ></path>
              </svg>
            </div>
            <div tw="flex flex-col p-6">
              <div tw="flex justify-between items-center">
                <div tw="flex flex-col">
                  <div tw="flex font-semibold text-[18px] leading-[0.85]">Current Stock</div>
                  <div tw="flex font-medium text-[16px] leading-[0.85]">
                    {currentStock ? formatTz(currentStock.reported_at, "LLL d '@' h:mm a", "UTC") : "No Data"}
                  </div>
                </div>
                <div tw="flex font-bold text-[32px] -mb-[8px]">{currentStock?.quantity ?? "--"}</div>
              </div>
              <div tw="flex justify-between items-center mt-3">
                <div tw="flex flex-col">
                  <div tw="flex font-semibold text-[18px] leading-[0.85]">Next Restock</div>
                  <div tw="flex font-medium text-[16px] leading-[0.85]">
                    {nextRestock
                      ? `Expected ${formatTz(nextRestock.earliest, "LLL d", "UTC")} – ${formatTz(
                          nextRestock.latest,
                          "LLL d",
                          "UTC",
                        )}`
                      : "No restock expected"}
                  </div>
                </div>
                <div tw="flex font-bold text-[32px] -mb-[8px]">{nextRestock?.quantity ?? "--"}</div>
              </div>
            </div>
            <div tw="flex mt-auto justify-center text-[14px] font-medium">
              <div>All times are in UTC</div>
            </div>
          </div>
        </div>
        <div tw="flex w-[675px] h-full pt-[25px]">
          <div
            tw="flex w-full h-full rounded-tl-[20px] overflow-hidden shadow-sm"
            style={{ backgroundImage: `url(${imageUrl})` }}
          >
            <img tw="absolute bottom-2 left-2" src={mapboxLogo} width={203 * 0.7} height={50 * 0.7} />
            <img
              tw="absolute top-1/2 left-1/2"
              style={{ transform: "translate(-50%, -100%)" }}
              src={stockStyle.pin}
              width={27 * 2}
              height={40 * 2}
            />
            <div
              tw="flex absolute bottom-0 right-0 pl-2 pr-1 pt-1 font-light text-xs rounded-tl-[10px]"
              style={{ backgroundColor: "#ffffff80" }}
            >
              © Mapbox © OpenStreetMap
            </div>
          </div>
        </div>
      </div>
    );
  } else if (options.type === "map_global") {
    throw badRequest("Not implemented");
  }

  const satori = await satoriPromise;

  const svg = await satori(markup, {
    width: 1000,
    height: 650,
    fonts: [
      {
        name: "Poppins",
        data: poppinsLight.buffer,
        weight: 300,
        style: "normal",
      },
      {
        name: "Poppins",
        data: poppinsRegular.buffer,
        weight: 400,
        style: "normal",
      },
      {
        name: "Poppins",
        data: poppinsMedium.buffer,
        weight: 500,
        style: "normal",
      },
      {
        name: "Poppins",
        data: poppinsSemiBold.buffer,
        weight: 600,
        style: "normal",
      },
      {
        name: "Poppins",
        data: poppinsBold.buffer,
        weight: 700,
        style: "normal",
      },
    ],
    // debug: true,
  });

  // return new Response(svg, {
  //   headers: {
  //     "Content-Type": "image/svg+xml",
  //   },
  // });

  const png = await context.env.RESVG?.fetch("http://example.com", { method: "POST", body: svg });
  if (!png?.ok) throw serverError("Resvg Worker Unavailable");

  const response = new Response(png.body, png);

  response.headers.set("Cache-Control", "public, max-age=" + 60 * 60 * 12);

  context.waitUntil(cache.put(cacheRequest, response.clone() as unknown as CFResponse));

  return response;
};
