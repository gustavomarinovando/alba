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

test("binding a dataset to a different subject clears its stale local cache", async () => {
  const storage = await import("./storage");
  await storage.saveEntry({ ...legacyEntry, date: "2026-07-15", note: "device leftover" }, "shared-device");
  await storage.saveEntryForSync({ ...legacyEntry, date: "2026-07-16", note: "queued leftover" }, "shared-device");
  await storage.bindDatasetToSubject("shared-device", "subject-a");

  await storage.bindDatasetToSubject("shared-device", "subject-b");

  expect(await storage.getAllEntries("shared-device")).toEqual([]);
  expect(await storage.getPendingSyncMutations("shared-device")).toEqual([]);
});

test("re-binding a dataset to the same subject preserves local data", async () => {
  const storage = await import("./storage");
  await storage.bindDatasetToSubject("same-subject-device", "subject-c");
  await storage.saveEntry({ ...legacyEntry, date: "2026-07-17", note: "keep me" }, "same-subject-device");

  await storage.bindDatasetToSubject("same-subject-device", "subject-c");

  const entries = await storage.getAllEntries("same-subject-device");
  expect(entries).toHaveLength(1);
  expect(entries[0].note).toBe("keep me");
});

test("replacement replays pending upserts and deletes", async () => {
  const storage = await import("./storage");
  const pendingUpsert = { ...legacyEntry, note: "pending wins" };
  const pendingDelete = { ...legacyEntry, date: "2026-07-09", note: "delete me" };
  await storage.saveEntryForSync(pendingUpsert);
  await storage.saveEntryForSync(pendingDelete);
  await storage.deleteEntryForSync(pendingDelete.date);

  await storage.replaceEntries([
    { ...legacyEntry, note: "imported version" },
    { ...pendingDelete, note: "import resurrected delete" },
  ]);

  const entries = await storage.getAllEntries();
  expect(entries).toHaveLength(1);
  expect(entries[0].note).toBe("pending wins");
  expect(await storage.getPendingSyncMutations()).toHaveLength(2);
});
