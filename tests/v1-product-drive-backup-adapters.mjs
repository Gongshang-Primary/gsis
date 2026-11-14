import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { canonical, digest } from "../v1/runtime/store.mjs";
import {
  listBackupDatasets,
  buildBackupDataset,
  encodeBackupWorkbook,
} from "../v1/runtime/drive-backup-data.mjs";
import { defaults } from "../v1/services/deploy/model.mjs";
import {
  validateWorkbook,
  exportWorkbook,
} from "../v1/services/deploy/workbooks.mjs";
import { workbook as layoutWorkbook } from "../v1/services/layout/service.mjs";
import { previewTableImport } from "../v1/services/calendar/table-import.mjs";
const school = "school",
  now = Date.now();
for (const owner of [
  "deploy",
  "layout",
  "lord",
  "roster",
  "calendar",
  "venues",
]) {
  const h = await createDatabase(owner),
    env = {
      DB: h.db,
      ARTIFACTS: h.bucket,
      SERVICE_NAME: owner,
      SCHOOL_ID: school,
    };
  try {
    if (owner === "deploy") {
      await h.db
        .prepare(
          "INSERT INTO deploy_versions(school_id,id,name,revision,metadata,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(school, "2027:term1", "Term1", 1, "{}", now)
        .run();
      await h.db
        .prepare(
          "INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          school,
          "2027:term1",
          "_settings",
          "ascExport",
          1,
          JSON.stringify({ year: 2027, schoolCode: "SYNTHETIC" }),
        )
        .run();
      const definitions = await listBackupDatasets(env);
      const recovery = await buildBackupDataset(
        env,
        definitions.find((d) => d.kind === "version-recovery"),
      );
      const recovered = JSON.parse(new TextDecoder().decode(recovery.bytes));
      assert.equal(recovered.document.ascExport.schoolCode, "SYNTHETIC");
      assert.equal(
        recovered.rows.length,
        1,
        "complete owner version includes settings omitted from canonical table exports",
      );
      assert.equal(recovery.importable, false);
      for (const definition of definitions.filter((d) => d.scope)) {
        const result = await buildBackupDataset(env, definition),
          expected = exportWorkbook(
            {
              ...defaults(),
              id: "2027:term1",
              name: "Term1",
              revision: 1,
              createdAt: now,
            },
            definition.scope,
            school,
            1,
          );
        if (!definition.importable) expected.metadata.mode = "reporting-only";
        assert.deepEqual(result.book, expected);
        assert.ok((await encodeBackupWorkbook(result.book)).length > 0);
      }
      const ip = await buildBackupDataset(
        env,
        definitions.find((d) => d.scope === "IP"),
      );
      assert.doesNotThrow(() =>
        validateWorkbook(
          ip.book,
          { ...defaults(), id: "2027:term1" },
          school,
          1,
        ),
      );
      assert.throws(
        () =>
          validateWorkbook(
            ip.book,
            { ...defaults(), id: "2027:term1" },
            school,
            2,
          ),
        (e) => e.code === "REVISION_CONFLICT",
      );
      await h.db
        .prepare(
          "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2001) INSERT INTO deploy_rows(school_id,version_id,scope,row_id,revision,value) SELECT 'school','2027:term1','teacherNotes',CAST(x AS TEXT),1,'null' FROM n",
        )
        .run();
      await assert.rejects(
        buildBackupDataset(env, definitions[0]),
        (e) => e.code === "DRIVE_BACKUP_SOURCE_BOUNDS",
      );
    } else if (owner === "layout") {
      const snapshot = {
        year: 2027,
        venues: [],
        classes: [
          {
            id: "1A",
            code: "1A",
            level: 1,
            name: "1A",
            shortName: "A",
            active: "Y",
          },
        ],
        groups: [],
        allocations: [],
        pupilBreakdown: [],
      };
      const body = canonical(snapshot),
        hash = await digest(body),
        key = school + "/layout/2027/" + hash + ".json";
      await h.bucket.put(key, body);
      await h.db
        .prepare(
          "INSERT INTO layout_snapshots(school_id,snapshot_id,year,revision,object_key,sha256,bytes,source_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          school,
          "snapshot",
          2027,
          3,
          key,
          hash,
          new TextEncoder().encode(body).length,
          "{}",
          now,
        )
        .run();
      await h.db
        .prepare(
          "INSERT INTO layout_heads(school_id,year,revision,snapshot_id,updated_at) VALUES(?,?,?,?,?)",
        )
        .bind(school, 2027, 3, "snapshot", now)
        .run();
      const definitions = await listBackupDatasets(env),
        result = await buildBackupDataset(env, definitions[0]);
      assert.deepEqual(result.book, layoutWorkbook(snapshot, school, 3));
      await h.bucket.put(key, "{}");
      await assert.rejects(
        buildBackupDataset(env, definitions[0]),
        (e) => e.code === "ARTIFACT_INTEGRITY",
      );
    } else if (owner === "lord") {
      await h.db
        .prepare(
          "INSERT INTO lord_resources(school_id,resource_id,name,type,capacity,active,exclusive,buffer_periods,revision,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          school,
          "trolley",
          "Cart A",
          "tablet",
          30,
          1,
          1,
          1,
          4,
          JSON.stringify({
            cart: "A",
            stylusOption: true,
            headphoneOption: false,
          }),
        )
        .run();
      await h.db
        .prepare(
          "INSERT INTO lord_settings(school_id,setting_key,revision,value_json) VALUES(?,?,?,?)",
        )
        .bind(
          school,
          "referenceLists",
          5,
          JSON.stringify({ classes: ["1A"], subjects: ["Math"] }),
        )
        .run();
      await h.db
        .prepare(
          "INSERT INTO lord_settings(school_id,setting_key,revision,value_json) VALUES(?,?,?,?)",
        )
        .bind(
          school,
          "periodTimings",
          6,
          JSON.stringify({
            periods: [{ code: "0", start: "07:00", end: "07:30" }],
          }),
        )
        .run();
      const definitions = await listBackupDatasets(env);
      const resource = await buildBackupDataset(
        env,
        definitions.find((d) => d.id === "resources"),
      );
      assert.equal(resource.book.metadata.sourceRevision, '[["trolley",4]]');
      assert.deepEqual(resource.book.sheets.Reference.rows, [
        ["trolley", "Cart A", 30, "A", "tablet", true, false, true, true, 1],
      ]);
      await h.db
        .prepare(
          "UPDATE lord_resources SET metadata_json='{}' WHERE school_id=?",
        )
        .bind(school)
        .run();
      const noCart = await buildBackupDataset(
        env,
        definitions.find((d) => d.id === "resources"),
      );
      assert.equal(
        noCart.book.sheets.Reference.rows[0][3],
        "",
        "backup preserves empty editable cart; display fallback is not persisted",
      );
      await h.db
        .prepare(
          "INSERT INTO lord_resources(school_id,resource_id,name,type,capacity,active,exclusive,buffer_periods,revision,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(school, "Z", "Z cart", "tablet", 10, 1, 1, 0, 1, "{}")
        .run();
      await h.db
        .prepare(
          "INSERT INTO lord_resources(school_id,resource_id,name,type,capacity,active,exclusive,buffer_periods,revision,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(school, "a", "a cart", "tablet", 10, 1, 1, 0, 2, "{}")
        .run();
      const mixed = await buildBackupDataset(
        env,
        definitions.find((d) => d.id === "resources"),
      );
      assert.equal(
        mixed.book.metadata.sourceRevision,
        '[["Z",1],["a",2],["trolley",4]]',
        "resource revision metadata uses locale-independent ASCII ID ordering",
      );
      const classes = await buildBackupDataset(
        env,
        definitions.find((d) => d.id === "classes"),
      );
      assert.equal(classes.book.metadata.sourceRevision, "5");
      assert.deepEqual(classes.book.sheets.Reference.rows, [["1A"]]);
      const periods = await buildBackupDataset(
        env,
        definitions.find((d) => d.id === "periods"),
      );
      assert.equal(periods.book.metadata.sourceRevision, "6");
      assert.deepEqual(periods.book.sheets.Reference.rows, [
        ["0", "07:00", "07:30"],
      ]);
      await h.db
        .prepare(
          "INSERT INTO lord_reference_state(school_id,revision,observed_at,contacts_revision,next_refresh_at) VALUES(?,?,?,?,?)",
        )
        .bind(school, 1, now, "contacts-v1", now + 1000)
        .run();
      const before = await buildBackupDataset(env, { id: "records" });
      await h.db
        .prepare(
          "UPDATE lord_reference_state SET observed_at=?,next_refresh_at=?,revision=revision+1 WHERE school_id=?",
        )
        .bind(now + 10000, now + 20000, school)
        .run();
      const after = await buildBackupDataset(env, { id: "records" });
      assert.equal(
        after.sourceDigest,
        before.sourceDigest,
        "read observations do not alter content identity",
      );
    } else if (owner === "roster") {
      const model = {
          teachers: [
            { staffId: "s1", cells: { 0: ["Math", "1A", "Room", ""] } },
          ],
          periods: [{ period: 0 }],
        },
        raw = canonical(model),
        hash = await digest(raw),
        key = school + "/baseline/" + hash + ".json";
      await h.bucket.put(key, raw);
      await h.db
        .prepare(
          "INSERT INTO roster_baselines(school_id,baseline_id,revision,name,from_date,to_date,priority,model_key,digest,mapping_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          school,
          "b1",
          1,
          "Baseline",
          "2026-01-01",
          "2026-12-31",
          1,
          key,
          hash,
          "{}",
        )
        .run();
      const definitions = await listBackupDatasets(env),
        result = await buildBackupDataset(
          env,
          definitions.find((d) => d.kind === "baseline"),
        );
      assert.deepEqual(
        JSON.parse(new TextDecoder().decode(result.bytes)).artifact,
        model,
        "recovery package contains actual R2model, not just akey",
      );
      await h.bucket.delete(key);
      await assert.rejects(
        buildBackupDataset(
          env,
          definitions.find((d) => d.kind === "baseline"),
        ),
        (e) => e.code === "ARTIFACT_UNAVAILABLE",
      );
    } else if (owner === "calendar") {
      await h.db
        .prepare(
          "INSERT INTO calendar_metadata(school_id,kind,record_id,year,revision,data_json) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          school,
          "tags",
          "math",
          0,
          1,
          JSON.stringify({
            Tag: "Math",
            Meaning: "Mathematics",
            Active: "Yes",
            SortOrder: 1,
          }),
        )
        .run();
      const definitions = await listBackupDatasets(env),
        result = await buildBackupDataset(
          env,
          definitions.find((d) => d.id === "tags"),
        );
      assert.equal(result.importable, true);
      const ctx = {
        env: { ...env, GSIS_SECRET: "synthetic-test-only" },
        principal: { schoolId: school, actorId: "admin" },
        now,
      };
      assert.equal(
        (await previewTableImport(ctx, { workbook: result.book })).valid,
        true,
      );
      const edit = structuredClone(result.book);
      edit.sheets.Records.rows[0][3] = "Mathematics classes";
      assert.equal(
        (await previewTableImport(ctx, { workbook: edit })).changedRecords,
        1,
      );
      const stale = structuredClone(edit);
      stale.sourceRevision = "old";
      await assert.rejects(
        previewTableImport(ctx, { workbook: stale }),
        (e) => e.code === "METADATA_CONFLICT",
      );
      const records = await buildBackupDataset(
        env,
        definitions.find((d) => d.id === "records"),
      );
      assert.equal(records.importable, false);
    } else {
      const definitions = await listBackupDatasets(env),
        result = await buildBackupDataset(env, definitions[0]);
      assert.equal(result.importable, false);
      assert.equal(result.book.metadata.importable, false);
      assert.ok((await encodeBackupWorkbook(result.book)).length > 0);
      const large = JSON.stringify({ notes: "x".repeat(500000) });
      for (let i = 0; i < 9; i++)
        await h.db
          .prepare(
            "INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,?,?,?,?)",
          )
          .bind(school, "venues", "large-" + i, 1, large)
          .run();
      await assert.rejects(
        buildBackupDataset(env, definitions[0]),
        (e) => e.code === "DRIVE_BACKUP_SOURCE_BOUNDS",
        "SQL byte budget rejects oversized source before returning rows to Worker memory",
      );
      assert.equal(
        (
          await h.db
            .prepare("SELECT COUNT(*) n FROM drive_backup_assertions")
            .first()
        ).n,
        0,
        "failed source guard leaves no assertion row",
      );
    }
    console.log(
      "PASS " +
        owner +
        " Drive adapter actual owner schema, source identity and declared import boundary",
    );
  } finally {
    await h.close();
  }
}
