// src/utils/get-location.ts
import axios from 'axios';

export interface GeoLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  ll: number[] | null; // [lat, lng]
  postal: string | null;
  timezone: string | null;
  geonameId: number | null;
  raw?: any;
}

const DEFAULT_API_KEY = process.env.GEOIPIFY_API_KEY ?? 'at_8lEOuMi5o5icByIZkEPueVVWDVNqE';
const BASE_URL = 'https://geo.ipify.org/api/v2/country';


export const getLocation = async (ip: string | null | undefined): Promise<GeoLocation | null> => {
  if (!ip) return null;

  try {
    const { data } = await axios.get(BASE_URL, {
      params: { apiKey: DEFAULT_API_KEY, ipAddress: ip },
      timeout: 5000,
    });

    const loc = data?.location ?? {};

    const mapped: GeoLocation = {
      country: (loc.country as string) ?? null,
      region: (loc.region as string) ?? null,
      city: (loc.city as string) ?? null,
      ll:
        typeof loc.lat === 'number' && typeof loc.lng === 'number'
          ? [loc.lat as number, loc.lng as number]
          : null,
      postal: (loc.postalCode as string) ?? null,
      timezone: (loc.timezone as string) ?? null,
      geonameId: typeof loc.geonameId === 'number' ? (loc.geonameId as number) : null,
      raw: data,
    };

    return mapped;
  } catch (err: any) {
    return null;
  }
};

export default getLocation;

