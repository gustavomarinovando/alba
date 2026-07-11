import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterAll, expect, test } from "vitest";
import type { CycleEntry } from "../types";

const legacyEntry: CycleEntry = {
  date: "2026-07-10",
  isPeriod: true,
  flow: "medium",
  temperatureReadings: [],
  questionableTemp: false,
  note: "preserve me",
  createdAt: "2026-07-10T12:00:00.000Z",
  updatedAt: "2026-07-10T12:30:00.000Z",
};

afterAll(async () => {
  const { db } = await import("./storage");
  db.close();
  await Dexie.delete("ciclo-local");
});

test("v3 migration preserves legacy entries and queued mutations", async () => {
  const legacyDb = new Dexie("ciclo-local");
  legacyDb.version(1).stores({
    entries: "&date, isPeriod, updatedAt",
  });
  legacyDb.version(2).stores({
    entries: "&date, isPeriod, updatedAt",
    syncQueue: "&date, type, queuedAt",
  });
  await legacyDb.open();
  await legacyDb.table("entries").put(legacyEntry);
  await legacyDb.table("syncQueue").put({
    date: legacyEntry.date,
    type: "upsert",
    entry: legacyEntry,
    queuedAt: "2026-07-10T12:31:00.000Z",
    revision: "legacy-revision",
  });
  legacyDb.close();

  const storage = await import("./storage");
  const migratedEntries = await storage.getAllEntries();
  const migratedQueue = await storage.getPendingSyncMutations();

  expect(migratedEntries).toEqual([legacyEntry]);
  expect(migratedQueue).toHaveLength(1);
  expect(migratedQueue[0]).toMatchObject({
    datasetId: storage.LEGACY_LOCAL_DATASET_ID,
    date: legacyEntry.date,
    revision: "legacy-revision",
  });
  expect(await storage.db.entries.count()).toBe(1);
  expect(await storage.db.syncQueue.count()).toBe(1);
  expect(await storage.getDataset()).toMatchObject({
    id: storage.LEGACY_LOCAL_DATASET_ID,
    kind: "legacy",
  });
});

test("dataset-aware queue operations do not collide on the same date", async () => {
  const storage = await import("./storage");
  const secondEntry = { ...legacyEntry, note: "second subject" };

  await storage.saveEntryForSync(secondEntry, "subject-two");

  expect(await storage.getPendingSyncMutations()).toHaveLength(1);
  expect(await storage.getPendingSyncMutations("subject-two")).toHaveLength(1);
  expect((await storage.getAllEntries("subject-two"))[0].note).toBe("second subject");
  expect((await storage.getAllEntries())[0].note).toBe("preserve me");
});

test("remote changes cannot overwrite a pending local revision", async () => {
  const storage = await import("./storage");
  const remoteEntry = {
    ...legacyEntry,
    note: "remote overwrite",
    updatedAt: "2026-07-11T12:30:00.000Z",
  };

  expect(await storage.applyRemoteEntry(remoteEntry)).toBe(false);
  expect((await storage.getAllEntries())[0].note).toBe("preserve me");
});
