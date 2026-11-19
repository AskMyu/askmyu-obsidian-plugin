/**
 * The meeting's card types under the name shared's `prepList.ts` and `meetingPost.ts` import them by (`./prep`), so
 * the plugin's copies (`src/prepList.ts`, `src/meetingPost.ts`) are the originals word for word below their headers.
 * Types only: the wire shapes, canonical in the monorepo and vendored in the mirror (`src/wire`).
 */

export type { AfterItem, PostSource, PrepAfter, PrepCardV2, PrepHistoryRow, PrepLineRef, PrepListItem, PrepPerson, PrepState, SinceLastRow } from './wire';
