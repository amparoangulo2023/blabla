import { Item } from "@blahaj-app/static";
import type { LoaderArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import type { ShouldRevalidateFunction } from "@remix-run/react";
import { useParams } from "@remix-run/react";
import { useQuery } from "@tanstack/react-query";
import equal from "fast-deep-equal";
import type { FC } from "react";
import { createContext, useContext, useState } from "react";
import type { TypedMetaFunction, UseDataFunctionReturn } from "remix-typedjson";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import type { DynamicLinksFunction } from "remix-utils";
import { promiseHash } from "remix-utils";
import { route, type RouteParams } from "routes-gen";
import { Sidebar } from "../components/map/sidebar";
import StoreMap from "../components/map/store-map";
import { MotionFlex } from "../components/motion-flex";
import defaultTransition from "../utils/default-transition";
import { dummyUseState } from "../utils/dummy-use-state";
import findStore from "../utils/find-store";
import { generateLinks } from "../utils/generate-links";
import { generateMeta } from "../utils/generate-meta";
import getStoreCountryDatum from "../utils/get-store-country-datum";
import { ITEM_NAME } from "../utils/item-names";
import {
  mapGlobalMetaDescription,
  mapGlobalMetaTitle,
  mapStoreMetaDescription,
  mapStoreMetaTitle,
} from "../utils/templates";
import type { UseStateType } from "../utils/types";
import useInitial from "../utils/use-initial";
import usePreviousNotUndefined from "../utils/use-previous-not-undefined";
import { getGlobalDataClient, getGlobalDataServer } from "./internal.globaldata";
import { getStockHistoryClient, getStockHistoryServer } from "./internal.stockhistory";

export const shouldRevalidate: ShouldRevalidateFunction = () => {
  return false;
};

export const loader = async ({ context, params: rawParams, request }: LoaderArgs) => {
  const params = rawParams as RouteParams["/:item/map/:storeId?"];

  if (!Object.values(Item).includes(rawParams.item as Item)) {
    throw json(null, { status: 404 });
  }

  const location =
    typeof context?.cf?.latitude === "string" && typeof context?.cf?.longitude === "string"
      ? { latitude: parseFloat(context.cf.latitude), longitude: parseFloat(context.cf.longitude) }
      : undefined;

  const resolved = await promiseHash({
    globalData: getGlobalDataServer(context, params.item),
    stockHistory: params.storeId
      ? getStockHistoryServer(context, params.item, params.storeId)
      : Promise.resolve(undefined),
  });

  const cacheBust = Math.floor(Date.now() / 1000 / 60 / 12)
    .toString(16)
    .padStart(8, "0");

  return typedjson({ ...resolved, location, cacheBust, time: Date.now() });
};

export const meta: TypedMetaFunction<typeof loader> = ({ data, params: rawParams }) => {
  const params = rawParams as RouteParams["/:item/map/:storeId?"];

  const item = params.item as Item;
  const itemName = ITEM_NAME[item];
  const store = params.storeId ? findStore(params.storeId) : undefined;

  const country = store ? getStoreCountryDatum(store) : undefined;
  // const flag = country ? toRegionalIndicators(country.code) : undefined;

  return generateMeta({
    title: store ? mapStoreMetaTitle(itemName, store.name) : mapGlobalMetaTitle(itemName),
    description:
      store && country?.name
        ? mapStoreMetaDescription(itemName, store.name, country.name)
        : mapGlobalMetaDescription(itemName),
    url: new URL(route("/:item/map/:storeId?", params), __baseUrl__).href,
    image: store
      ? { type: "map_store", item: item, storeId: store.id, cacheBust: data.cacheBust }
      : { type: "map_global", item: item, cacheBust: data.cacheBust },
  });
};

const dynamicLinks: DynamicLinksFunction = ({ params: rawParams }) => {
  const params = rawParams as RouteParams["/:item/map/:storeId?"];

  const item = params.item as Item;
  const store = params.storeId ? findStore(params.storeId) : undefined;

  return generateLinks({
    oembed: store ? { type: "map_store", item: item, storeId: store.id } : { type: "map_global", item },
  });
};
export const handle = { dynamicLinks };

interface MapContextType {
  params: RouteParams["/:item/map/:storeId?"];
  loaderData: UseDataFunctionReturn<typeof loader> | null;
  storeBasicsHeightState: UseStateType<number | undefined>;
}

export const MapContext = createContext<MapContextType>({
  params: { item: Item.BLAHAJ },
  loaderData: null,
  storeBasicsHeightState: dummyUseState(undefined),
});

export const useGlobalDataQuery = (item: Item, loaderData?: UseDataFunctionReturn<typeof loader>) => {
  const queryKey = ["map-global-data", item];
  const initialQueryKey = useInitial(queryKey);

  const query = useQuery(queryKey, () => getGlobalDataClient(item), {
    cacheTime: 1000 * 60 * 30,
    staleTime: 1000 * 60 * 35,
    initialDataUpdatedAt: loaderData?.time,
    initialData: equal(queryKey, initialQueryKey) ? loaderData?.globalData : undefined,
    refetchOnWindowFocus: false,
  });

  const previousData = usePreviousNotUndefined(query.data);

  return {
    ...query,
    data: query.isLoading && previousData ? previousData : query.data,
  };
};

export const useStockHistoryQuery = (
  item: Item,
  storeId: string | null,
  loaderData?: UseDataFunctionReturn<typeof loader>,
) => {
  const queryKey = ["map-stock-history", { item, storeId }];
  const initialQueryKey = useInitial(queryKey);

  const query = useQuery(queryKey, () => (typeof storeId === "string" ? getStockHistoryClient(item, storeId) : null), {
    cacheTime: 1000 * 60 * 30,
    staleTime: 1000 * 60 * 35,
    initialDataUpdatedAt: loaderData?.time,
    initialData: equal(queryKey, initialQueryKey) ? loaderData?.stockHistory : undefined,
    refetchOnWindowFocus: false,
  });

  const previousData = usePreviousNotUndefined(query.data);

  return {
    ...query,
    data: query.isLoading && previousData ? previousData : query.data,
  };
};

export const useMapContext = () => useContext(MapContext);

const Map: FC = () => {
  const loaderData = useTypedLoaderData<typeof loader>();

  const params = useParams() as RouteParams["/:item/map/:storeId?"];

  const storeBasicsHeightState = useState<number | undefined>(undefined);
  const [storeBasicsHeight] = storeBasicsHeightState;

  return (
    <MapContext.Provider
      value={{
        params,
        loaderData,
        storeBasicsHeightState,
      }}
    >
      <MotionFlex
        animate={{ "--store-basics-height": storeBasicsHeight ? storeBasicsHeight + "px" : "unset" } as any}
        transition={defaultTransition}
        height="100%"
        flexDirection={{ base: "column-reverse", md: "row" }}
      >
        <Sidebar />
        <StoreMap />
      </MotionFlex>
    </MapContext.Provider>
  );
};
export default Map;
