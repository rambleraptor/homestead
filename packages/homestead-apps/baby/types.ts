import type {
  BOTTLE_CONTENTS,
  DIAPER_KINDS,
  EVENT_KINDS,
  FEED_METHODS,
  SIDES,
  VOLUME_UNITS,
} from './resources';

export type EventKind = (typeof EVENT_KINDS)[number];
export type FeedMethod = (typeof FEED_METHODS)[number];
export type Side = (typeof SIDES)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type BottleContents = (typeof BOTTLE_CONTENTS)[number];
export type DiaperKind = (typeof DIAPER_KINDS)[number];

export interface Baby {
  id: string;
  path: string;
  name: string;
  birth_date?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

export interface BabyFormData {
  name: string;
  birth_date?: string | null;
}

/** The fields of a baby-event a person (or the app) sets. */
export interface BabyEventFields {
  kind: EventKind;
  started_at?: string;
  ended_at?: string | null;
  feed_method?: FeedMethod | null;
  side?: Side | null;
  amount?: number | null;
  amount_unit?: VolumeUnit | null;
  contents?: BottleContents | null;
  diaper?: DiaperKind | null;
  notes?: string | null;
}

/**
 * A baby-event record. Events live at `/babies/{id}/baby-events/{id}`; the
 * list hook adds the parent's id as `baby` so rows can be joined to it.
 */
export interface BabyEvent extends BabyEventFields {
  id: string;
  path: string;
  baby: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

/** Variables for creating an event: its fields plus the baby it is for. */
export type BabyEventCreate = BabyEventFields & { baby: string; recordId?: string };
