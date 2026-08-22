import type { Adapter } from './types';
import { urbanests } from './urbanests';
import { hostelworld } from './hostelworld';
import { foundstudy } from './foundstudy';
import { pricetext } from './pricetext';
// To add a site: create refresh/adapters/<name>.ts implementing Adapter, register it here, and set
// "adapter": "<name>" in data/booking-sites.json for the rows it covers. See README "Adding a booking adapter".
export const ADAPTERS: Record<string, Adapter> = { urbanests, hostelworld, foundstudy, pricetext };
